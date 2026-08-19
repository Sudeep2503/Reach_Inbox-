local key = KEYS[1]
local minDelay = tonumber(ARGV[1])
local now = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])

local last = tonumber(redis.call('get', key) or "0")
local nextAllowed = last + minDelay

if now >= nextAllowed then
  redis.call('set', key, now, 'EX', ttl)
  return {1, now}
else
  return {0, nextAllowed}
end
