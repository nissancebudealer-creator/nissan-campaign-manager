import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new AppError(
      503,
      "Image storage isn't configured yet — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.",
    );
  }
  client ??= createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  return client;
}

// Uploads a campaign/template image to Supabase Storage (survives backend redeploys, unlike the
// old local-disk uploads that Render's ephemeral filesystem wiped on every deploy) and returns
// its public URL for embedding directly in a sent email/message.
export async function uploadCampaignImage(
  buffer: Buffer,
  filename: string,
  contentType: string,
): Promise<string> {
  const supabase = getClient();
  const { error } = await supabase.storage
    .from(env.SUPABASE_STORAGE_BUCKET)
    .upload(filename, buffer, { contentType, upsert: false });

  if (error) {
    throw new AppError(502, `Failed to upload image to storage: ${error.message}`);
  }

  const { data } = supabase.storage.from(env.SUPABASE_STORAGE_BUCKET).getPublicUrl(filename);
  return data.publicUrl;
}
