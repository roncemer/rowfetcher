// Copyright (c) 2010-2018 Ronald B. Cemer
// All rights reserved.
// This software is released under the 3-clause BSD license.
// Please see the accompanying LICENS for details.

// Generic functions to fetch (and optionally cache) rows using server-side requests,
// with optional caching.

// Construct a RowFetcher instance.
// cache is an instance of the Cache class, or null if no caching is to be performed.
function RowFetcher(cache, cacheExpirationTimeSeconds) {
	this.cache = cache;
	this.cacheExpirationTimeSeconds = cacheExpirationTimeSeconds;
}

// Get the base URL for the current page, excluding the query string and anchor.
// Returns the current page URL as a string, excluding the query string and anchor.
RowFetcher.prototype.getBaseURL = function() {
	var url = window.location.href;
	var idx1 = url.indexOf('?'), idx2 = url.indexOf('#');
	var idx = ((idx1 >= 0) && (idx2 >= 0)) ? Math.min(idx1, idx2) : ((idx1 >= 0) ? idx1 : idx2);
	if (idx >= 0) url = url.substring(0, idx);
	return url;
}

// Get a row for a URL.
// If this RowFetcher has a Cache, the cache will be searched first.
// url is the URL to request.  It should be built using the buildCommandURL() function.
// If the first argument is a function, an async request will be made, and the first argument
// will be used as a callback which will receive the fetched row (or null if not found), the
// textStatus, and the jqXHR instance; remaining arguments will be shifted down.
// If the first argument is NOT a function, a synchronous request which returns the row, or
// null if not found.
RowFetcher.prototype.getRowForURL = function(url) {
	if (typeof(arguments[0]) == 'function') {
		// Asynchronous with callback
		var callback = arguments[0];
		for (var i = 1; i < arguments.length; i++) arguments[i-1] = arguments[i];
		this.getRowArrayForURL(
			function(rows, textStatus, jqXHR) {
				var row = ((rows !== null) && (rows.length > 0)) ? rows[0] : null;
				callback(row, textStatus, jqXHR);
			},
			url
		);
	} else {
		// Synchronous with return value
		var rows = this.getRowArrayForURL(url);
		return (rows.length > 0) ? rows[0] : null;
	}
}

// Get an array of rows for a URL.
// If this RowFetcher has a Cache, the cache will be searched first.
// url is the URL to request.  It should be built using the buildCommandURL() function.
// If the first argument is a function, an async request will be made, and the first argument
// will be used as a callback which will receive the fetched rows (or an empty array if not found),
// the // textStatus, and the jqXHR instance; remaining arguments will be shifted down.
// If the first argument is NOT a function, a synchronous request which returns the rows, or
// an empty array if not found.
RowFetcher.prototype.getRowArrayForURL = function(url) {
	if (typeof(arguments[0]) == 'function') {
		// Asynchronous with callback
		var callback = arguments[0];
		for (var i = 1; i < arguments.length; i++) arguments[i-1] = arguments[i];
		if (this.cache != null) {
			var rows = this.cache.get(url);
			if (rows !== null) {
				callback(rows, null, null);
				return;
			}
		}
		var cache = this.cache;
		$.ajax({
			type:'GET',
			url:url,
			async:true,
			cache:false,
			processData:false,
			success:function(data, textStatus, jqXHR) {
				if (typeof(data) != 'object') data = [];
				if (cache != null) {
					cache.set(url, data, this.cacheExpirationTimeSeconds);
				}
				callback(data, textStatus, jqXHR);
			},
			error:function(jqXHR, textStatus, errorThrown) {
				callback([], textStatus, jqXHR);
			}
		});
	} else {
		// Synchronous with return value
		var rows;
		if (this.cache != null) {
			rows = this.cache.get(url);
			if (rows !== null) return rows;
		}
		var json = $.ajax({
			type:'GET',
			url:url,
			async:false,
			cache:false,
			processData:false,
		}).responseText;
		rows = (json != '') ? JSON.parse(json) : [];
		if (this.cache != null) {
			this.cache.set(url, rows, this.cacheExpirationTimeSeconds);
		}
		return rows;
	}
}

// Utility function to build a query string (including the initial '?' character) from an object
// which maps parameter names to parameter values.  This function references no variables in
// the rowFetcher instance, so may be called statically.
// Example:
//     console.log(RowFetcher.prototype.buildQueryStringFromMap({q:'abc#def', n:'123+456'}));
// Outputs:
//     ?q=abc%23def&n=123%2B456
RowFetcher.prototype.buildQueryStringFromMap = function(paramsMap) {
	var queryString = '', sep = '?'
	for (var paramName in paramsMap) {
		queryString += sep+encodeURIComponent(paramName)+'='+encodeURIComponent(paramsMap[paramName]);
		if (sep != '&') sep = '&';
	}
	return queryString;
}

// Given a query string, or a URL which may contain a query string, parse the query string into an
// object whose keys are parameter names and values are parameter values.
// Function arguments:
//     queryStringOrURL: The query string, with or without the initial '?' character; or a complete
//         URL or URI including optional query string.
//     isURIOrURL: true if the first parameter is a complete URL or URI; false if the first parameter
//         is just a query string.
//         Optional.  If omitted, defaults to false.
//     keepLastParamValueOnDupe: Controls what happens when the same parameter name occurs more than
//         once in the query string.  If this is true, the last value for the parameter name is
//         retained in the map; if this is false, the first value for the parameter name is retained.
//         Optional.  If omitted, defaults to false.
// Examples:
//     console.log(JSON.stringify(RowFetcher.prototype.parseQueryStringToMap('?abc=123&def=ab%20cd')));
//         outputs: {"abc":"123","def":"ab cd"}
//     console.log(JSON.stringify(RowFetcher.prototype.parseQueryStringToMap('http://www.example.com/index.html?abc=123&def=ab%20cd', true)));
//         outputs: {"abc":"123","def":"ab cd"}
//     console.log(JSON.stringify(RowFetcher.prototype.parseQueryStringToMap('?abc=123&def=ab%20cd&abc=ghi')));
//         outputs: {"abc":"123","def":"ab cd"}
//     console.log(JSON.stringify(RowFetcher.prototype.parseQueryStringToMap('?abc=123&def=ab%20cd&abc=ghi', false, true)));
//         outputs: {"abc":"ghi","def":"ab cd"}
RowFetcher.prototype.parseQueryStringToMap = function(queryStringOrURL, isURIOrURL, keepLastParamValueOnDupe) {
	if (typeof(keepLastParamValueOnDupe) == 'undefined') keepLastParamValueOnDupe = false;

	var queryString;
	if ((typeof(isURIOrURL) != 'undefined') && isURIOrURL) {
		// Get query string from URL, excluding the initial '?'.
		var qidx = queryStringOrURL.indexOf('?');
		queryString = (qidx >= 0) ? queryStringOrURL.substr(qidx+1) : '';
	} else {
		// Use query string as passed in, except that we strip the initial '?', if present.
		queryString = queryStringOrURL;
		if ((queryString != '') && (queryString.charAt(0) == '?')) queryString = queryString.substr(1);
	}
	// Strip off the fragment identifier, if present.
	var hashidx = queryString.indexOf('#');
	if (hashidx >= 0) queryString = queryString.substr(0, hashidx);

	// Build and return the map.
	var paramsMap = {};
	var pieces = queryString.split('&');
	var key, val;
	for (var i = 0; i < pieces.length; i++) {
		var piece = pieces[i];
		var eqidx = piece.indexOf('=');
		if (eqidx >= 0) {
			key = decodeURIComponent(piece.substr(0, eqidx));
			val = decodeURIComponent(piece.substr(eqidx+1));
		} else {
			key = decodeURIComponent(piece);
			val = "";
		}
		if ((typeof(paramsMap[key]) == 'undefined') || keepLastParamValueOnDupe) {
			paramsMap[key] = val;
		}
	}
	return paramsMap;
}

// Build a URL for a server-side request.
// command is the server-side command to execute.
// idParamName is the name of the parameter which corresponds to the unique identifier for the
//     row.  This will typically be the name of the database table's primary key column.
//     Note that if we are fetching an array of rows, the identifier is not required to be unique.
// id is the unique identifying value for the row.  This will typically be the primary key value.
//     Note that if we are fetching an array of rows, the identifier is not required to be unique.
// optionalParameters is an associative array of keys to values.  These will be appended to the
//     request URL in the format &key=value, with each key and value properly URL-encoded.
//     This argument can be omitted if not needed.
// Returns a string containing the URL for the server-side request.
//
// NOTE: For automatically adding extra request parameters onto all server-side request URLs
// at the page level, define the fixupAJAXURL(url) function in your controller.  It will be
// called any time the buildCommandURL() function is used to build a URL, just before the URL
// is returned.  You can then tack on additional query parameters to the URL.  Be sure to
// separate them with '&', and be sure to URL-encode them.
RowFetcher.prototype.buildCommandURL = function(command, idParamName, id, optionalParameters) {
	var url = this.getBaseURL()+'?command='+encodeURIComponent(command)+'&'+idParamName+'='+encodeURIComponent(id);
	if (typeof(optionalParameters) == 'object') {
		for (var key in optionalParameters) {
			url += '&'+encodeURIComponent(key)+'='+encodeURIComponent(optionalParameters[key]);
		}
	}
	if (typeof fixupAJAXURL == 'function') {
		url = fixupAJAXURL(url);
	}
	return url;
}

// Fetch a row from the server by its numeric (integer) id.
// This function's parameters are the same as for buildCommandURL().
// If the first argument is a function, an async request will be made, and the first argument
// will be used as a callback which will receive the fetched row (or null if not found), the
// textStatus, and the jqXHR instance; remaining arguments will be shifted down.
// If the first argument is NOT a function, a synchronous request which returns the row, or
// null if not found.
RowFetcher.prototype.getRowForId = function(command, idParamName, id, optionalParameters) {
	if (typeof(arguments[0]) == 'function') {
		// Asynchronous with callback
		var callback = arguments[0];
		for (var i = 1; i < arguments.length; i++) arguments[i-1] = arguments[i];
		if (id > 0) {
			this.getRowForURL(callback, this.buildCommandURL(command, idParamName, id, optionalParameters));
		} else {
			callback(null, null, null);
		}
	} else {
		// Synchronous with return value
		if (id > 0) {
			return this.getRowForURL(this.buildCommandURL(command, idParamName, id, optionalParameters));
		}
		return null;
	}
}

// Fetch a row from the server by its string id.
// This function's parameters are the same as for buildCommandURL().
// If the first argument is a function, an async request will be made, and the first argument
// will be used as a callback which will receive the fetched row (or null if not found), the
// textStatus, and the jqXHR instance; remaining arguments will be shifted down.
// If the first argument is NOT a function, a synchronous request which returns the row, or
// null if not found.
RowFetcher.prototype.getRowForIdString = function(command, idParamName, id, optionalParameters) {
	if (typeof(arguments[0]) == 'function') {
		// Asynchronous with callback
		var callback = arguments[0];
		for (var i = 1; i < arguments.length; i++) arguments[i-1] = arguments[i];
		if (id != '') {
			this.getRowForURL(callback, this.buildCommandURL(command, idParamName, id, optionalParameters));
		} else {
			callback(null, null, null);
		}
	} else {
		// Synchronous with return value
		if (id != '') {
			return this.getRowForURL(this.buildCommandURL(command, idParamName, id, optionalParameters));
		}
		return null;
	}
}

// Fetch an array of matching rows from the server by a common numeric (integer) id.
// This function's parameters are the same as for buildCommandURL().
// If the first argument is a function, an async request will be made, and the first argument
// will be used as a callback which will receive the fetched rows (or an empty array if not found),
// the // textStatus, and the jqXHR instance; remaining arguments will be shifted down.
// If the first argument is NOT a function, a synchronous request which returns the rows, or
// an empty array if not found.
RowFetcher.prototype.getRowArrayForId = function(command, idParamName, id, optionalParameters) {
	if (typeof(arguments[0]) == 'function') {
		// Asynchronous with callback
		var callback = arguments[0];
		for (var i = 1; i < arguments.length; i++) arguments[i-1] = arguments[i];
		if (id > 0) {
			this.getRowArrayForURL(callback, this.buildCommandURL(command, idParamName, id, optionalParameters));
		} else {
			callback(null, null, null);
		}
	} else {
		// Synchronous with return value
		if (id > 0) {
			return this.getRowArrayForURL(this.buildCommandURL(command, idParamName, id, optionalParameters));
		}
		return [];
	}
}

// Fetch an array of matching rows from the server by a common string id.
// This function's parameters are the same as for buildCommandURL().
// If the first argument is a function, an async request will be made, and the first argument
// will be used as a callback which will receive the fetched rows (or an empty array if not found),
// the // textStatus, and the jqXHR instance; remaining arguments will be shifted down.
// If the first argument is NOT a function, a synchronous request which returns the rows, or
// an empty array if not found.
RowFetcher.prototype.getRowArrayForIdString = function(command, idParamName, id, optionalParameters) {
	if (typeof(arguments[0]) == 'function') {
		// Asynchronous with callback
		var callback = arguments[0];
		for (var i = 1; i < arguments.length; i++) arguments[i-1] = arguments[i];
		if (id != '') {
			this.getRowArrayForURL(callback, this.buildCommandURL(command, idParamName, id, optionalParameters));
		} else {
			callback(null, null, null);
		}
	} else {
		// Synchronous with return value
		if (id != '') {
			return this.getRowArrayForURL(this.buildCommandURL(command, idParamName, id, optionalParameters));
		}
		return [];
	}
}
