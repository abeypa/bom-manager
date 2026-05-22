-- OpenRouter API keys must never be readable from app_settings because
-- authenticated users have read access to this table. The key now lives only
-- in the Cloudflare Worker secret OPENROUTER_API_KEY.

delete from app_settings
where key = 'ai_api_key';
