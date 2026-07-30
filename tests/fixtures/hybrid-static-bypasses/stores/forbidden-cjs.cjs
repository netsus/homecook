/* eslint-disable @typescript-eslint/no-require-imports -- adversarial CommonJS runtime fixture */
const { createClient } = require("@supabase/supabase-js");

module.exports = createClient("https://example.supabase.co", "fixture-key");
