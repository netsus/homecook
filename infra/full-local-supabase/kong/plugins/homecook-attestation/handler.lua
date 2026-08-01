local bit = require "bit"
local hmac = require "resty.hmac"

local plugin = {
  PRIORITY = 1000,
  VERSION = "1.0.0",
}

local verified_header = "x-homecook-attestation-verified"
local payload_header = "x-homecook-session-attestation"
local signature_header = "x-homecook-session-attestation-signature"

local function secure_equal(left, right)
  if #left ~= #right then
    return false
  end
  local difference = 0
  for index = 1, #left do
    difference = bit.bor(
      difference,
      bit.bxor(string.byte(left, index), string.byte(right, index))
    )
  end
  return difference == 0
end

function plugin:access()
  local payload = kong.request.get_header(payload_header)
  local signature = kong.request.get_header(signature_header)
  kong.service.request.clear_header(verified_header)
  kong.service.request.clear_header(payload_header)
  kong.service.request.clear_header(signature_header)

  if payload == nil and signature == nil then
    return
  end
  if type(payload) ~= "string" or type(signature) ~= "string"
    or #payload == 0 or #payload > 8192 or #signature ~= 64
    or signature:match("^[0-9a-fA-F]+$") == nil then
    return kong.response.exit(401, { message = "invalid attestation" })
  end

  local secret = os.getenv("HOMECOOK_SESSION_ATTESTATION_HMAC_KEY_V1")
  if type(secret) ~= "string" or #secret < 32 then
    return kong.response.exit(503, { message = "attestation unavailable" })
  end
  local context = hmac:new(secret, hmac.ALGOS.SHA256)
  local expected = context and context:final(payload, true)
  if type(expected) ~= "string"
    or not secure_equal(signature:lower(), expected) then
    return kong.response.exit(401, { message = "invalid attestation" })
  end

  kong.service.request.set_header(verified_header, payload)
end

return plugin
