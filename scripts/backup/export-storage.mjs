import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const outputRoot = path.resolve(process.argv[2] || "backup/storage");

if (!supabaseUrl || !serviceKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function safeObjectPath(bucket, objectPath) {
  const parts = [bucket, ...objectPath.split("/")].map((part) =>
    encodeURIComponent(part.replaceAll("\\", "_"))
  );
  const full = path.resolve(outputRoot, ...parts);
  if (!full.startsWith(outputRoot + path.sep)) throw new Error("Unsafe storage object path rejected.");
  return full;
}

async function listPage(bucket, prefix, offset) {
  const { data, error } = await supabase.storage.from(bucket).list(prefix, {
    limit: 100,
    offset,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) throw new Error(`Storage list failed for ${bucket}/${prefix}: ${error.message}`);
  return data || [];
}

async function listAll(bucket, prefix) {
  const result = [];
  for (let offset = 0; ; offset += 100) {
    const page = await listPage(bucket, prefix, offset);
    result.push(...page);
    if (page.length < 100) break;
  }
  return result;
}

const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
if (bucketsError) throw bucketsError;

const manifest = { created_at: new Date().toISOString(), buckets: [] };

async function walk(bucket, prefix = "") {
  const entries = await listAll(bucket.name, prefix);
  for (const entry of entries) {
    const key = prefix ? `${prefix}/${entry.name}` : entry.name;
    const isFolder = !entry.id && !entry.metadata;
    if (isFolder) {
      await walk(bucket, key);
      continue;
    }

    const { data, error } = await supabase.storage.from(bucket.name).download(key);
    if (error) throw new Error(`Storage download failed for ${bucket.name}/${key}: ${error.message}`);
    const target = safeObjectPath(bucket.name, key);
    await mkdir(path.dirname(target), { recursive: true });
    const bytes = Buffer.from(await data.arrayBuffer());
    await writeFile(target, bytes);
    manifest.buckets.find((b) => b.name === bucket.name).objects.push({
      key,
      size: bytes.length,
      content_type: entry.metadata?.mimetype || "application/octet-stream",
      updated_at: entry.updated_at || null,
    });
  }
}

for (const bucket of buckets || []) {
  manifest.buckets.push({
    id: bucket.id,
    name: bucket.name,
    public: bucket.public,
    file_size_limit: bucket.file_size_limit,
    allowed_mime_types: bucket.allowed_mime_types,
    objects: [],
  });
  await walk(bucket);
}

await mkdir(outputRoot, { recursive: true });
await writeFile(path.join(outputRoot, "storage-manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(`Exported ${manifest.buckets.reduce((n,b)=>n+b.objects.length,0)} objects from ${manifest.buckets.length} buckets.`);
