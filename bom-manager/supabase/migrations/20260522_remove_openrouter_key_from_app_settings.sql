-- Remove the legacy plaintext OpenRouter key. The Worker stores replacements
-- entered in AI Settings as AES-GCM ciphertext plus a separate IV; the
-- encryption key remains a Cloudflare-only secret.

delete from app_settings
where key = 'ai_api_key';
