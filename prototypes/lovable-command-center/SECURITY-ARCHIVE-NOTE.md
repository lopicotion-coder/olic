# Source archive hygiene

The text source files were screened before upload for common private-key, API-key, Supabase secret-key, AWS access-key, and JWT patterns. No matches were found in the files inspected.

The binary `public/favicon.ico` was not included because the connected Lovable reader returned binary data through a text-only interface. Re-export this asset from Lovable if exact visual parity is required.