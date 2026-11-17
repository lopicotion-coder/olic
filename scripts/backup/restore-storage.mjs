import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const root = path.resolve(process.argv[2] || "backup/storage");
const manifest = JSON.parse(await readFile(path.join(root, "storage-manifest.json"), "utf8"));

if (!supabaseUrl || !serviceKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
if (process.env.CONFIRM_STORAGE_RESTORE !== "YES") {
  throw new Error("Set CONFIRM_STORAGE_RESTORE=YES only after verifying the destination project.");
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function safeObjectPath(bucket, objectPath) {
  const parts = [bucket, ...objectPath.split("/")].map((part) =>
    encodeURIComponent(part.replaceAll("\\", "_"))
  );
  const full = path.resolve(root, ...parts);
  if (!full.startsWith(root + path.sep)) throw new Error("Unsafe path rejected.");
  return full;
}

const { data: currentBuckets, error: listError } = await supabase.storage.listBuckets();
if (listError) throw listError;
const existing = new Set((currentBuckets || []).map((b) => b.name));

for (const bucket of manifest.buckets || []) {
  const options = {
    public: Boolean(bucket.public),
    fileSizeLimit: bucket.file_size_limit ?? undefined,
    allowedMimeTypes: bucket.allowed_mime_types ?? undefined,
  };
  if (!existing.has(bucket.name)) {
    const { error } = await supabase.storage.createBucket(bucket.name, options);
    if (error) throw new Error(`Could not create bucket ${bucket.name}: ${error.message}`);
  } else {
    const { error } = await supabase.storage.updateBucket(bucket.name, options);
    if (error) throw new Error(`Could not update bucket ${bucket.name}: ${error.message}`);
  }

  for (const object of bucket.objects || []) {
    const localPath = safeObjectPath(bucket.name, object.key);
    const bytes = await readFile(localPath);
    const { error } = await supabase.storage.from(bucket.name).upload(object.key, bytes, {
      contentType: object.content_type || "application/octet-stream",
      upsert: true,
    });
    if (error) throw new Error(`Could not restore ${bucket.name}/${object.key}: ${error.message}`);
  }
}

console.log("Storage object restore completed. Recheck bucket policies and RLS before use.");
