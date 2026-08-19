local key = KEYS[1]
local limit = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])

local current = tonumber(redis.call('get', key) or "0")

if current < limit then
  redis.call('incr', key)
  if current == 0 then
    redis.call('expire', key, ttl)
  end
  return {1, current + 1}
else
  return {0, current}
end
