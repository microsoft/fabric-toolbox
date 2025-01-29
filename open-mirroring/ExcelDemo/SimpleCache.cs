namespace ExcelDemo
{
    public class SimpleCache<TKey, TValue>
    {
        private readonly Dictionary<TKey, CacheItem> _cache = new Dictionary<TKey, CacheItem>();
        private readonly TimeSpan _defaultTTL;

        public SimpleCache(TimeSpan defaultTTL)
        {
            _defaultTTL = defaultTTL;
        }

        public void Add(TKey key, TValue value, TimeSpan? ttl = null)
        {
            var expiration = DateTime.UtcNow.Add(ttl ?? _defaultTTL);
            _cache[key] = new CacheItem(value, expiration);
        }

        public bool TryGetValue(TKey key, out TValue value)
        {
            if (_cache.TryGetValue(key, out CacheItem cacheItem))
            {
                if (DateTime.UtcNow <= cacheItem.Expiration)
                {
                    value = cacheItem.Value;
                    return true;
                }
                else
                {
                    // Expired item, remove it from the cache
                    _cache.Remove(key);
                }
            }

            value = default;
            return false;
        }

        public void Remove(TKey key)
        {
            _cache.Remove(key);
        }

        public void Clear()
        {
            _cache.Clear();
        }

        private class CacheItem
        {
            public TValue Value { get; }
            public DateTime Expiration { get; }

            public CacheItem(TValue value, DateTime expiration)
            {
                Value = value;
                Expiration = expiration;
            }
        }
    }
}

