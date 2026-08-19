local key = KEYS[1]
local current = tonumber(redis.call('get', key) or "0")

if current > 0 then
  redis.call('decr', key)
end

return current > 0 and 1 or 0