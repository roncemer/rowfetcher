// Copyright (c) 2010-2018 Ronald B. Cemer
// All rights reserved.
// This software is released under the 3-clause BSD license.
// Please see the accompanying LICENSE for details.

// Simple, in-memory cache.

// Construct a Cache instance.
// maxEntries is the maximum number of entries the cache can hold at one time.
function Cache(maxEntries) {
	if (maxEntries < 1) maxEntries = 1;
	this.maxEntries = maxEntries;
	this.__cache = {};
}

// Get the value for a cache key.
// key is the cache key.
// Returns the corresponding cached value, or null if the value is not in the cache or has expried.
Cache.prototype.get = function(key) {
	if (typeof(this.__cache[key]) != 'undefined') {
		var entry = this.__cache[key];
		if (new Date().getTime() < entry.expires) {
			return entry.value;
		}
		// The entry is expired.  Delete it.
		delete this.__cache[key];
	}
	return null;
}

// Set the value for a cache key.
// key is the cache key.
// value is the corresponding value.
// expirationTimeSeconds is the number of seconds the entry will last before it expires.
Cache.prototype.set = function(key, value, expirationTimeSeconds) {
	var now = new Date().getTime();
	var expires = new Date().getTime()+(expirationTimeSeconds*1000);
	if (typeof(this.__cache[key]) != 'undefined') {
		// Entry already exists; overwrite it and update its timestamp.
		var entry = this.__cache[key];
		entry.value = value;
		entry.whenAdded = now;
		entry.expires = expires;
		return;
	}
	if (this.__cache.length >= this.maxEntries) {
		this.clean();
		if (this.__cache.length >= this.maxEntries) {
			// Remove the oldest entry.
			var oldestKey = null, oldestEntry = null;
			for (var k in this.__cache) {
				var entry = this.__cache[k];
				if ((oldestKey === null) || (entry.whenAdded < oldestEntry.whenAdded)) {
					oldestKey = k;
					oldestEntry = entry;
				}
			}
			delete this.__cache[oldestKey];
		}
	}
	this.__cache[key] = { value:value, whenAdded:now, expires:expires };
}

// Delete a key from the cache.
// key is the cache key.
Cache.prototype.delete = function(key) {
	delete this.__cache[key];
}

// Clean the cache, deleting all expired entries.
Cache.prototype.clean = function() {
	// Remove all expired entries.
	for (var k in this.__cache) {
		var entry = this.__cache[k];
		if (entry.expires <= now) {
			delete this.__cache[k];
		}
	}
}

// Clear the cache, removing all entries.
Cache.prototype.clear = function() {
	this.__cache = {};
}
