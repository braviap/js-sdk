//TODO: check if it will be cached
define('echo/variables', [], function() {
	return {};
});

define("echo/utils", ["jquery", "echo/variables"], function($, Variables) {
"use strict";

var Utils;

//if (!window.Echo) window.Echo = {};

//if (Echo.Utils) return;

//if (!Echo.Variables) Echo.Variables = {};



/**
 * Static class implements common methods of data processing.
 * The Utils class is used in various places of Echo JS SDK components.
 *
 * @package environment.pack.js
 */

Utils = {};

Utils.cache = {};

Utils.regexps = {
	"templateSubstitution": "{([0-9a-z\\.]+)(?:\\:((?:[0-9a-z_-]+\\.)*[0-9a-z_-]+))?}",
	"mobileUA": /mobile|midp-|opera mini|iphone|ipad|blackberry|nokia|samsung|docomo|symbian|windows ce|windows phone|android|up\.browser|ipod|netfront|skyfire|palm|webos|audiovox/i,
	"w3cdtf": /^(\d{4})(?:-(\d\d)(?:-(\d\d))?(?:(?:T(\d\d):(\d\d):(\d\d))(?:\.(\d{1,3}))?(?:Z|(?:(\+|-)(\d\d):(\d\d))))?)?$/,
	"parseURL": /^(?:(?:([^:\/\?#]+):)?\/\/)?([^:\/\?#]*)?(?::(\d+))?([^\?#]*)(?:\?([^#]*))?(?:#(.*))?/
};

/**
 * @static
 * Method to add CSS styles on the page.
 *
 * This function adds CSS styles to the style tag which is placed in the head
 * of the document. The first argument is a string that contains CSS styles,
 * the second one is the unique identity string of CSS styles to be added.
 * If CSS styles with corresponding id were added before then this function
 * returns false.
 *
 *     // style tag in the head of HTML document
 *     // <style>
 *     //     .example-class { font-size: 12px; }
 *     // </style>
 *
 *     Utils.addCSS(
 *         '.echo-class { font-size: 14px; }'
 *         , 'echo-class-id');
 *     // returns true because styles with id = 'echo-class-id' weren't added before
 *     // <style>
 *     //     .example-class { font-size: 12px; }
 *     //     .echo-class { font-size: 14px; }
 *     // </style>
 *
 *     Utils.addCSS(
 *         '.echo-new-class { font-size: 16px; }'
 *         , 'echo-class-id');
 *     // returns false because styles with id = 'echo-class-id' were added before
 *
 * @param {String} cssCode
 * Contains CSS styles to be added.
 *
 * @param {String} id
 * Unique identity string of the CSS styles set.
 *
 * @return {Boolean}
 * true if CSS styles was successfully added, false - if CSS styles are already
 * in the document.
 */
Utils.addCSS = function(cssCode, id) {
	if (typeof this.cache.cssStyles === "undefined") {
		this.cache.cssStyles = {
			"anchor": undefined,
			"index": 1,
			"processed": {}
		};
	}
	var cssStyles = this.cache.cssStyles;
	if (id) {
		if (Utils.hasCSS(id)) return false;
		cssStyles.processed[id] = true;
	}
	var currentCssCode = "";
	var oldStyle = cssStyles.anchor;
	if (oldStyle && oldStyle.length) {
		currentCssCode = oldStyle.html();
	}
	// IE limit is 4095 rules per style tag
	// so we limit it to 100000 characters
	// (2000 rules x 50 characters per rule)
	if (currentCssCode.length + cssCode.length > 100000) {
		cssStyles.index++;
		oldStyle = null;
		currentCssCode = "";
	}
	var newStyle = $('<style id="echo-css-rules-' + cssStyles.index + '" type="text/css">' + currentCssCode + cssCode + '</style>');
	if (oldStyle && oldStyle.length) {
		// use replacing instead of adding css to existing element
		// because IE doesn't allow it
		oldStyle.replaceWith(newStyle);
	} else {
		if (cssStyles.anchor) {
			cssStyles.anchor.after(newStyle);
		} else {
			$(document.getElementsByTagName("head")[0] || document.documentElement).prepend(newStyle);
		}
	}
	cssStyles.anchor = newStyle;
	return true;
};

/**
 * @static
 * Method to check whether the given set of CSS rules was already added into the page.
 *
 * This function might be used in conjunction with the Utils.addCSS function
 * to check certain conditions before adding new styles.
 *
 * @param {String} id
 * Unique identity string of the CSS styles set.
 *
 * @return {Boolean}
 * ‘true’ if the given CSS styles set was previously added into the page,
 * otherwise ‘false’.
 */
Utils.hasCSS = function(id) {
	return this.cache.cssStyles
		? !!this.cache.cssStyles.processed[id]
		: false;
};

/**
 * @static
 * Method implementing folding mechanism.
 *
 * This function iterates over each value of the object passing them to
 * callback function. The first argument is the object that is available
 * in callback function to accumulate items.
 *
 *     var array = Utils.foldl([], [1, 2, 3], function(item, acc) {
 *         acc.push(item);
 *     }); // array will be [1, 2, 3];
 *
 *     var hash = Utils.foldl({}, {"key1": "value1", "key2": "value2"}, function(item, acc, key) {
 *         if (key === "key2") return;
 *         acc[key] = item;
 *     }); // hash will be {"key1": "value1"};
 *
 * @param {Object|Array} acc
 * Defines the initial accumulator.
 *
 * @param {Object|Array} object
 * The object to be folded.
 *
 * @param {Function} callback
 * The callback function executed for each item of the object to be folded.
 *
 * @param {Object} callback.item
 * The item of the object to iterate over.
 *
 * @param {Object|Array} callback.acc
 * The object that accumulates items.
 *
 * @param {String} [callback.key]
 * Defines the key of iterated items.
 *
 * @return {Object|Array}
 * The resulting object
 */
Utils.foldl = function(acc, object, callback) {
	var result;
	$.each(object, function(key, item) {
		result = callback(item, acc, key);
		if (result !== undefined) {
			acc = result;
		}
	});
	return acc;
};

/**
 * @static
 * Method to get a specific field value in the given object.
 *
 * This function returns the corresponding value of the given object field or the
 * default value if specified as the third argument. Use the dot char ('.') as the
 * delimiter of the key parts to get the nested field value.
 *
 *     var data = {
 *         "key1": "value1",
 *         "key2": {
 *             "key2-1": "value2-1"
 *         }
 *     };
 *
 *     Utils.get(data, "key1"); // returns "value1"
 *     Utils.get(data, "key2"); // returns object {"key2-1": "value2-1"}
 *     Utils.get(data, "key2.key2-1"); // returns "value2-1"
 *
 * @param {Object} obj
 * The source object where the value defined for the given key should be looked for.
 *
 * @param {Mixed} key
 * Specifies the field to access the necessary value.
 * Possible types are String or Array. If the key is defined as an Array,
 * the parameter should contain the key chain to access the necessary value.
 * Example: the "key2.key2-2" and ["key2", "key2-2"] key representations are equivalent.
 *
 * @param {Object} [defauts]
 * Default value to be returned in case when no corresponding key was found
 * in the specified object.
 *
 * @param {Function} [callback]
 * The callback function to be executed while switching between the nesting levels
 * while traversing the source object. The callback is executed once in case of the
 * plain keys (i.e. without nesting levels).
 *
 * @param {Object} callback.data
 * Contains the object value on the current nesting level during the object traversing.
 *
 * @param {String} callback.key
 * Contains the part of the key to be used during this iteration of the object traversing.
 *
 * @return {Mixed}
 * The corresponding value found in the source object or the default value
 * (if defined during the function call) in case the specified field is not found
 * or its value is undefined.
 */
Utils.get = function(obj, key, defaults, callback) {
	var keys = Utils._prepareFieldAccessKey(key);
	if (!keys || !obj) return defaults;
	var found = true;
	var iteration = function(_key, _data) {
		if (callback) {
			callback(_data, _key);
		}
		if (typeof _data[_key] === "undefined") {
			found = false;
		} else {
			return _data[_key];
		}
	};
	// avoid foldl usage for plain keys
	var value = keys.length === 1
		? iteration(keys.pop(), obj)
		: Utils.foldl(obj, keys, iteration);
	return found ? value : defaults;
};

/**
 * @static
 * Method to remove a specific field from the given object.
 *
 * This function removes the corresponding field in the target object.
 * Use the dot char ('.') as a delimiter of the key parts to remove nested field.
 *
 *     var data = {
 *         "key1": "value1",
 *         "key2": {
 *             "key2-1": "value2-1",
 *             "key2-2": {
 *                 "key2-2-1": "value2-2-1"
 *             }
 *         }
 *     };
 *
 *     Utils.remove(data, "key1"); // returns true and key1 delete
 *     Utils.remove(data, "key2"); // returns true and key2 delete
 *     Utils.remove(data, "key2.key2-2.key2-2-1"); // returns true and obj.key2.key2-2 returns empty object
 *     Utils.remove(data, "not_defined_key"); // returns false
 *
 * @param {Object} obj
 * Specifies the target object which should be updated.
 *
 * @param {Mixed} key
 * The key for value removing. Possible types are String or Array. If its Array, parameter
 * should contains list of keys if its complex. Ex.: "key2.key2-2" => ["key2", "key2-2"].
 *
 * @return {Boolean}
 * The boolean value which indicates whether the key was removed from the given object.
 */
Utils.remove = function(obj, key) {
	var keys = Utils._prepareFieldAccessKey(key);
	if (!keys || !obj) return false;
	var field = keys.pop();
	// passing obj as a default value as well
	// to operate with it in case of the plain key
	var target = Utils.get(obj, keys, obj);
	return target === null || typeof target[field] === "undefined"
		? false
		: delete target[field];
};

/**
 * @static
 * Method to define a given value for the specified key in the target object.
 *
 * This function allows to define the value for the corresponding field in the object.
 * Use the dot char ('.') as a delimiter of the key parts to define nested field value.
 *
 *     var data = {
 *         "key1": "value1",
 *         "key2": {
 *             "key2-1": "value2-1"
 *         }
 *     };
 *
 *     Utils.set(data, "key1", "new value"); // data["key1"] will be "new value"
 *     Utils.set(data, "key1", {"key1-1": "value1-1"}); // data["key1"] will be {"key1-1":"value1-1"}
 *
 * @param {Object} obj
 * Specifies the target object which should be updated.
 *
 * @param {String} key
 * Defines the key where the given value should be stored.
 *
 * @param {Mixed} value
 * The data which should be defined for the given key.
 *
 * @return {Boolean}
 * The boolean value which indicates whether the necessary value was defined
 * for the target object using the key specified. Returns the 'false' boolean value
 * in case the object or the key is not specified.
 */
Utils.set = function(obj, key, value) {
	var keys = Utils._prepareFieldAccessKey(key);
	if (!keys || !obj) return false;
	var field = keys.pop();
	var target = obj;
	if (keys.length > 0) {
		target = Utils.get(obj, keys, undefined, function(acc, v) {
			if (typeof acc[v] === "undefined") {
				acc[v] = {};
			}
		});
	}
	target[field] = value;
	return true;
};

Utils._prepareFieldAccessKey = function(key) {
	if (!key) return false;
	return typeof key === "string"
		? key.split(".")
		: key instanceof Array && key.length
			? key
			: false; // unknown key type
};

/**
 * @static
 * Method to convert special characters to HTML entities.
 *
 * Some characters have special significance in HTML and should be represented by
 * HTML entities if they are to preserve their meanings. This function returns a
 * string with these conversions made.
 *
 *     Utils.htmlize("special characters: &<>"); // returns "special characters: &amp;&lt;&gt;"
 *
 * Note: the function works with the "string" type argument only.
 * If the type of the value passed to the function differs from the "string" type,
 * the same value is returned with no changes.
 *
 * @param {String} text
 * The string to be converted.
 *
 * @return {String}
 * Converted string.
 */
Utils.htmlize = function(text) {
	return typeof text === "string" ? $("<div>").text(text).html() : text;
};

/**
 * @static
 * Method to convert JavaScript value to JavaScript Object Notation (JSON) string.
 *
 * These methods convert JavaScript object to JSON string. 
 * This function uses JSON.stringify() method if it is available in the browser.
 *
 *     Utils.objectToJSON(null); // returns 'null'
 *     Utils.objectToJSON(123); // returns '123'
 *     Utils.objectToJSON(Number.POSITIVE_INFINITY); // returns 'null'
 *     Utils.objectToJSON("string\n"); // returns '"string\n"'
 *     Utils.objectToJSON(true); // returns true
 *     Utils.objectToJSON(["value1", "value2"]); // returns '["value1","value2"]'
 *     Utils.objectToJSON({"k1": "v1", "k2": "v2"}); // returns '{"k1":"v1","k2":"v2"}'
 *
 * @param {Mixed} obj
 * The value to be converted.
 *
 * @return {String}
 * String containing JSON.
 */
Utils.objectToJSON = function(obj) {
	if (window.JSON && JSON.stringify) {
		return JSON.stringify(obj);
	}
	// object -> JSON conversion support for IE7
	var container;
	var encodeJSONLiteral = function(string) {
		var replacements = {
			'\b': '\\b',
			'\t': '\\t',
			'\n': '\\n',
			'\f': '\\f',
			'\r': '\\r',
			'"': '\\"',
			'\\': '\\\\'
		};
		return string.replace(/[\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff\\]/g,
			function (a) {
				return (replacements.hasOwnProperty(a))
					? replacements[a]
					: '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
			});
	};

	var out;
	switch (typeof obj) {
		case "number": out = isFinite(obj) ? obj : 'null'; break;
		case "string": out = '"' + encodeJSONLiteral(obj) + '"'; break;
		case "boolean": out = obj.toString(); break;
		default:
			if (obj instanceof Array) {
				container = $.map(obj, function(element) { return Utils.objectToJSON(element); });
				out = '[' + container.join(",") + ']';
			} else if (obj instanceof Object) {
				var source = obj.exportProperties || obj;
				container = Utils.foldl([], source, function(value, acc, property) {
					if (source instanceof Array) {
						property = value;
						value = obj[property];
					}
					acc.push('"' + property + '":' + Utils.objectToJSON(value));
				});
				out = '{' + container.join(",") + '}';
			} else {
				out = 'null';
			}
	}
	return out;
};

/**
 * @static
 * Method to truncate HTML text.
 *
 * This function truncates HTML contents preserving the right HTML structure
 * and without truncating tags. If truncation hits the middle of the word, the word
 * itself is preserved and truncation starts right after this word.
 *
 *     Utils.htmlTextTruncate("Welcome to Echo SDK", 5, "..."); // returns "Welcome..."
 *     Utils.htmlTextTruncate("<div>Welcome to Echo SDK", 5, "", true); // returns "<div>Welcome</div>"
 *     Utils.htmlTextTruncate("<div>Welcome to Echo SDK</div>", 3, "...", true); // returns "<div>Welcome...</div>"
 *     Utils.htmlTextTruncate("<div>Welcome to Echo SDK</div>", 17, "...", true); // returns "<div>Welcome to Echo SDK</div>"
 *
 * @param {String} text
 * The string to be truncated.
 *
 * @param {Number} limit
 * The length of returned string without HTML tags.
 *
 * @param {String} postfix
 * The string to be added to truncated string.
 *
 * @param {Boolean} forceClosingTags
 * This parameter takes effect only when no truncation was performed. Otherwise
 * (when the content was truncated) the function restores the HTML structure
 * regardless of the forseClosingTags parameter value.
 *
 * @return {String}
 * Truncated string.
 */
Utils.htmlTextTruncate = function(text, limit, postfix, forceClosingTags) {
	if (!limit || text.length < limit) return text;

	var tags = [], count = 0, finalPos = 0;
	var wordRegex = /(\w)+/;
	var htmlSpecialCharRegex = /^(\S)+;/;
	if (!this.cache.standaloneTags) {
		this.cache.standaloneTags =
			Utils.foldl(
				{},
				"br hr input img area param base link meta option".split(" "),
				function(value, acc, key) { acc[value] = true; }
			);
	}

	for (var i = 0; i < text.length; i++) {
		var symbol = text.charAt(i);
		if (symbol === "<") {
			var tail = text.indexOf(">", i);
			if (tail < 0) return text;
			var source = text.substring(i + 1, tail);
			var tag = "";
			var isTagClosing = false;
			if (source.charAt(0) === "/") {
				isTagClosing = true;
				source = source.substring(1);
			}
			tag = source.match(wordRegex)[0];
			if (isTagClosing) {
				var current = tags.pop();
				if (!current || current !== tag) return text;
			} else if (!this.cache.standaloneTags[tag]) {
				tags.push(tag);
			}
			i = tail;
		} else if (symbol === "&" && text.substring(i).match(htmlSpecialCharRegex)) {
			i = text.indexOf(";", i);
			count++;
		} else {
			if (count >= limit) {
				finalPos = i;
				break;
			}
			count++;
		}
	}
	if (finalPos || forceClosingTags) {
		if (finalPos) {
			var cut = text.substring(finalPos - 1, text.length - 1).match(/^\w+/);
			if (cut) {
				finalPos += cut[0].length - 1;
			}
			if (finalPos !== text.length - 1) {
				text = text.substring(0, finalPos) + (postfix || "");
			}
		}
		for (var i = tags.length - 1; i >= 0; i--) {
			text += "</" + tags[i] + ">";
		}
	}
	return text;
};

/**
 * @static
 * Method to strip HTML tags from the string.
 *
 * This function returns a string with all HTML tags stripped from the given string.
 *
 *     Utils.stripTags("<div>Content</div>"); // returns "Content"
 *
 * Note: the function works with the "string" type argument only. If the value with
 * type different from "string" is passed to the function, the same value would be
 * returned with no changes.
 *
 * @param {String} text
 * The string to be stripped.
 *
 * @return {String}
 * Stripped string.
 */
Utils.stripTags = function(text) {
	return typeof text === "string" ? $("<div>").html(text).text() : text;
};

/**
 * @static
 * Method to parse the URL and return its parts.
 *
 * This function parses a URL and returns a hash containing parts of the URL
 * which are presented. This function is not meant to validate the given URL,
 * it only breaks it up into the parts.
 *
 *     var url = "http://domain.com:8080/some/path/?query_string#hash_value";
 *     Utils.parseURL(url);
 *     // returns {
 *     //     "scheme": "http",
 *     //     "domain": "domain.com",
 *     //     "port": "8080",
 *     //     "path": "/some/path/"
 *     //     "query": "query_string",
 *     //     "fragment": "hash_value"
 *     // };
 *
 * @param {String} url
 * The URL to be parsed.
 *
 * @return {Object}
 * Object containing the following parts of the URL as fields:
 * scheme, domain, path, query, fragment.
 * Field will contain empty string if the corresponding part of the URL didn't match.
 */
Utils.parseURL = function(url) {
	if (typeof this.cache.parsedURLs === "undefined") {
		this.cache.parsedURLs = {};
	}
	var parsed = this.cache.parsedURLs;
	if (!parsed.hasOwnProperty(url)) {
		var parts = url.match(Utils.regexps.parseURL);
		parsed[url] = parts ? {
			"scheme": parts[1] || "",
			"domain": parts[2] || "",
			"port": parts[3] || "",
			"path": parts[4] || "/",
			"query": parts[5] || "",
			"fragment": parts[6] || ""
		} : undefined;
	}
	return parsed[url];
};

/**
 * @static
 * Method returning original visible color of the element.
 *
 * This function traverses the element parents recoursively to determine
 * original visible color of the element.It returns `transparent` string
 * if background-color of the element and its parents is not specified.
 *
 *     // HTML template
 *     var template =
 *         '<div class="container">' +
 *             '<div class="header" style="background-color: green;">header</div>' +
 *             '<div class="content" style="background-color: red;">' +
 *                 '<div class="section1"></div>' +
 *                 '<div class="section2"></div>' +
 *             '</div>' +
 *             '<div class="footer">footer</div>' +
 *         '</div>';
 *
 *     Utils.getVisibleColor( $(".header", template) ); // returns "rgb(0, 128, 0)"
 *     Utils.getVisibleColor( $(".section1", template) ); // returns "rgb(255, 0, 0)"
 *     Utils.getVisibleColor( $(".footer", template) ); // returns "transparent"
 *
 * @param {HTMLElement} element
 * HTML element which visible color is being determined.
 *
 * @return {String}
 * Visible color.
 */
Utils.getVisibleColor = function(element) {
	// calculate visible color of element (transparent is not visible)
	var color;
	do {
		color = element.css("backgroundColor");
		if (color !== "" && color !== "transparent" && !/rgba\((0,\s*){3}0\)/.test(color) || $.nodeName(element.get(0), "body")) {
			break;
		}
	} while (element = element.parent());
	return color || "transparent";
};

/**
 * @static
 * Method to convert datetime value from string representation to numeric timestamp.
 *
 *     Utils.timestampFromW3CDTF("1998-02-08T09:27:30Z"); // returns 886930050
 *     Utils.timestampFromW3CDTF("1998-02-08T09:27:30.733Z"); // returns 886930050.733
 *
 * The method can correctly parse any date format supported by user's browser.
 * However ISO 8601 format is understood independing of native support.
 * See [W3C Note](http://www.w3.org/TR/NOTE-datetime) for description of supported ISO 8601 subset.
 * Other suitable date formats are described in [RFC2822 Section 3.3](http://tools.ietf.org/html/rfc2822#page-14)
 * and in [MSDN topic](http://msdn.microsoft.com/en-us/library/ff743760.aspx).
 *
 * @param {String} datetime
 * String containing datetime value to be converted.
 *
 * @return {Number}
 * UNIX timestamp.
 */
Utils.timestampFromW3CDTF = function(datetime) {
	var time = Date.parse(datetime);
	if (isNaN(time)) {
		var parts = ["year", "month", "day", "hours", "minutes", "seconds", "milliseconds"];
		var matches = datetime.match(Utils.regexps.w3cdtf);
		if (!matches) {
			return undefined;
		}
		var dt = Utils.foldl({}, parts, function(key, acc, id) {
			acc[key] = +matches[id + 1] || 0;
		});
		var timeZone = matches.slice(parts.length + 1);
		if (timeZone[0]) {
			dt.hours = dt.hours - (timeZone[0] + timeZone[1]);
			dt.minutes = dt.minutes - (timeZone[0] + timeZone[2]);
		}
		time = Date.UTC(
			dt.year,
			dt.month ? dt.month - 1 : dt.month,
			dt.day || 1,
			dt.hours,
			dt.minutes,
			dt.seconds,
			dt.milliseconds
		);
		return isNaN(time)
			? undefined
			: time / 1000;
	}
	return time / 1000;
};

/**
 * @static
 * Method to determine that mobile device is used.
 *
 * The function determines by navigator.userAgent that mobile device is used.
 *
 * @return {Boolean}
 * True if mobile device is used, false if not.
 */
Utils.isMobileDevice = function() {
	// we can calculate it once and use the cached value
	// in other calls since user agent will not be changed
	if (typeof this.cache.isMobileDevice === "undefined") {
		this.cache.isMobileDevice = this.regexps.mobileUA.test(navigator.userAgent);
	}
	return this.cache.isMobileDevice;
};

/**
 * @static
 * Method returning a unique random string.
 *
 * This function returns a unique string specifying the number of milliseconds between
 * midnight January 1, 1970 (GMT) and the current time plus a random number.
 *
 *     Utils.getUniqueString(); // returns something like "134086853327622290480640764643"
 *
 * @return {String}
 * Unique random string.
 */
Utils.getUniqueString = function() {
	return (new Date()).valueOf() + Math.random().toString().substr(2);
};

/**
 * @static
 * Method which allows to inherit the object from another object.
 *
 * This function performs prototype inheritance of the JS objects.
 *
 * @param {Object} parent
 * Class which should be used as a parent for the first class.
 *
 * @param {Object} child
 * Class which should be entended.
 *
 * @return {Object}
 * Resulting class.
 */
Utils.inherit = function(parent, child) {
	var F = function() {};
	child = child || function() {};
	F.prototype = parent.prototype;
	child.prototype = new F();
	child.prototype.constructor = child;
	child.parent = parent.prototype;
	return child;
};

/**
 * @static
 * Method to acquire a class reference by the JS class name.
 *
 * This function returns the reference to the corresponding JS class defined
 * on the page.
 *
 * @param {String} name
 * Name of the component which we need to access.
 *
 * @return {Object}
 * Reference to the necessary JS class.
 */
Utils.getComponent = function(name) {
	return Utils.get(window, name);
};

/**
 * @static
 * Method which allows to check whether a given component was defined
 * on the page.
 *
 * This function returns the boolean value which represents whether
 * a given component is defined on the page.
 *
 * @param {String} name
 * Component name which needs to be checked.
 *
 * @return {Boolean}
 * True/false if the component was or wasn't found respectively.
 */
Utils.isComponentDefined = function(name) {
	return !!Utils.getComponent(name);
};

/**
 * @static
 * Method which loads image.
 *
 * This function returns image HTML element with source attribute that
 * equals first argument. If the image is not available then this function
 * loads the default image that is passed as a second argument.
 *
 * @param {Object} args
 * The object which contains attributes for loading image.
 *
 * @param {String} args.image
 * The URL of the image to be loaded.
 *
 * @param {String} [args.defaultImage]
 * The URL of the default image.
 *
 * @param {Function} [args.onload]
 * The callback which fires when image is loaded.
 *
 * @param {Function} [args.onerror]
 * The callback which fires when loading image fails.
 *
 * @return {HTMLElement}
 * Image HTML element.
 */
Utils.loadImage = function(args) {
	var url = args.image || args.defaultImage;
	var img = $("<img>");
	img.one({
		"error": args.onerror || function() {
			if (args.defaultImage && url !== args.defaultImage) {
				img.attr("src", args.defaultImage);
			}
		},
		"load": args.onload || $.noop
	});
	return img.attr("src", url);
};

/**
 * @static
 * Creates the HTML &lt;a> tag with the provided attribute names/values
 *
 * @param {Object} data
 * Hyperlink tag attribute key/value pairs, some of them are:
 *
 * @param {String} [data.caption]
 * Visible text for the hyperlink.
 *
 * @param {String} [data.href="javascript:void(0)"]
 * Hyperlink URL.
 *
 * @param {String} [data.target]
 * Target window.
 *
 * @param {Object} options
 * Configurable options affecting hyperlink behavior.
 *
 * @param {Boolean} [options.openInNewWindow=false]
 * Specifies whether this should be opened in a separate window or not.
 *
 * @param {Boolean} [options.skipEscaping=false]
 * Specifies whether href value should be htmlized or not.
 *
 * @return {String}
 * HTML string for &lt;a> tag.
 */
Utils.hyperlink = function(data, options) {
	data = $.extend({}, data);
	options = $.extend({}, options);
	var caption = data.caption || "";
	delete data.caption;
	if (options.openInNewWindow && !data.target) {
		data.target = "_blank";
	}
	if (!options.skipEscaping) {
		data.href = Utils.htmlize(data.href);
	}
	data.href = data.href || "javascript:void(0)";
	var attributes = Utils.foldl([], data, function(value, acc, key) {
		acc.push(key + '="' + value + '"');
	});
	return "<a " + attributes.join(" ") + ">" + caption + "</a>";
};

/**
 * @static
 * Function to log info/error message to the browser console in a unified format
 *
 * @param {Object} data
 * Defines the properties of the message which should be displayed.
 *
 * @param {String} data.message
 * Text description of the message which should be logged.
 *
 * @param {String} [data.component="Echo SDK"]
 * Name of the component which produced the message.
 *
 * @param {String} [data.type="info"]
 * Type/severity of the message.
 *
 * @param {String} [data.args]
 * Extra arguments to log.
 */
Utils.log = function(data) {
	if (!(window.console && console.log && data && data.message)) {
		return;
	}
	console.log(
		"[" + (data.component || "Echo SDK") + "]",
		(data.type || "info"), ":", data.message, " | args: ", data.args
	);
};

/**
 * @static
 * Function to call the functions from the list and call callback function
 * after it. Functions are called async. For sync calls use Utils.sequentialCall
 *
 * @param {Array} actions
 * List of functions to be called.
 *
 * @param {Function} [callback]
 * Callback function to be called after functions processing.
 */
Utils.parallelCall = function(actions, callback) {
	if (!actions || !actions.length) {
		callback && callback();
		return;
	}
	var remaining = actions.length;
	$.map(actions, function(action) {
		action(function() {
			if (!--remaining) {
				callback && callback();
			}
		});
	});
};

/**
 * @static
 * Function to call the functions from the list sequentially and call callback
 * function after it.
 *
 * @param {Array} actions
 * List of functions to be called sequentially.
 *
 * @param {Function} [callback]
 * Callback function to be called after functions processing.
 */
Utils.sequentialCall = function(actions, callback) {
	if (!actions || !actions.length) {
		callback && callback();
		return;
	}
	actions.shift()(function() {
		Utils.sequentialCall(actions, callback);
	});
};

/**
 * @static
 * Function used to replace the first character in the words with the uppercase character.
 *
 * @param {String} string
 * String of some words
 */
Utils.capitalize = function(string) {
	return string.replace(/\b[a-z]/g, function(match) {
		return match.toUpperCase();
	});
};

/**
 * @static
 * Templater function which compiles the given template using the provided data.
 *
 * Function can be used widely for html templates processing or any other action
 * requiring string interspersion.
 *
 * @param {Object} args
 * Specifies substitution process and parameters.
 *
 * @param {String} args.template
 * Template containing placeholders used for data interspersion.
 *
 * @param {Object} [args.data]
 * Data used in the template compilation.
 *
 * @param {Boolean} [args.strict]
 * Specifies whether the template should be replaced with the corresponding value,
 * preserving the replacement value type.
 *
 * @param {Object} [args.instructions]
 * Object containing the list of extra instructions to be applied during template compilation.
 *
 * @return {String}
 * Compiled string value.
 */
Utils.substitute = function(args) {
	var utils = this;
	var template = args.template;
	var substitutions = {
		"data": function(key, defaults) {
			return utils.get(args.data, key, defaults);
		}
	};
	var instructions = args.instructions
		? $.extend(substitutions, args.instructions)
		: substitutions;

	if (typeof utils.cache.regexps === "undefined") {
		var regex = utils.regexps.templateSubstitution;
		utils.cache.regexps = {
			"strict": new RegExp("^" + regex + "$", "i"),
			"single": new RegExp(regex, "i"),
			"multiple": new RegExp(regex, "ig")
		};
	}

	// checking if we need to execute in a strict mode,
	// i.e. whether to keep the substitution value type or not
	if (args.strict && utils.cache.regexps.strict.test(template)) {
		var match = utils.cache.regexps.single.exec(template);
		if (match && match[1] && instructions[match[1]]) {
			return instructions[match[1]](match[2]);
		}
	}

	// perform regular string substitution
	return template.replace(utils.cache.regexps.multiple, function(match, key, value) {
		if (!instructions[key]) return match;
		var result = instructions[key](value, "");
		var allowed = {"number": true, "string": true, "boolean": true};
		return allowed[typeof result] ? result : "";
	});
};

/**
 * @static
 * Function which checks if the value passed as a first argument is a function and executes
 * it in the given context. If the first argument has different type, it's returned as is.
 *
 * @param {Mixed} mixed
 * The value which should be checked and executed in case of a function type.
 *
 * @param {Object} context
 * Context in which the function should be executed.
 *
 * @return {Mixed}
 * The result of the function call in case the first argument is a function
 * or the first argument as is otherwise.
 */
Utils.invoke = function(mixed, context) {
	return $.isFunction(mixed)
		? context ? mixed.call(context) : mixed()
		: mixed;
};

/**
 * @static
 * Function which executes another function in the try/catch block.
 * If the given function completed its execution without throwing an exception,
 * then the "safelyExecute" returns result of that function execution.
 * Otherwise, the "safelyExecute" catches an exception and prints the
 * message to the console using the Utils#log function.
 * It is useful in case you want to avoid execution flow interruption
 * by the code which might potentially throw an exception.
 *
 *		// executes function without arguments and context
 *		Utils.safelyExecute(function() {});
 *		// returns undefined
 *
 *		// executes function with one argument & without context
 *		Utils.safelyExecute(function() {}, "string param");
 *		// returns undefined
 *
 *		someObject = {
 *			"param": "some string"
 *		};
 *
 *		someObject.fn = function(a, b) {
 *			return [this.param, a, b];
 *		};
 *
 *		// executes function with arguments & context
 *		Utils.safelyExecute(someObject.fn, [[], "string param"], someObject);
 *		// returns ["some string", [], "string param"]
 *
 *		// executes the function which throws an exception
 *		Utils.safelyExecute(function() { throw "Some error"; });
 *		// returns undefined and prints "Some error" message to the console
 *
 * @param {Function} fn
 * Function to be excuted in the try/catch wrapper
 *
 * @param {Mixed} [args]
 * The argument type might vary depending on the use-case:
 *
 *  + undefined - in case the given function doesn't expect any arguments
 *  + array - if the function to be called accepts more than one argument
 *  + value as is - when the function expects only one argument.
 *
 * @param {Object} [context]
 * Context in which the function should be executed.
 *
 * @return {Mixed}
 * The result of a given function execution in case it was completed
 * without throwing an exception. Otherwise - the undefined is returned.
 */
Utils.safelyExecute = function(fn, args, context) {
	context = context || null;
	args = $.isArray(args)
		? args
		: typeof args === "undefined"
			? [] : [args];
	try {
		return fn.apply(context, args);
	} catch(e) {
		Utils.log({
			"type": "error",
			"message": e.message || e,
			"component": (!!context && context.hasOwnProperty("name")) ? context.name : ""
		});
	}
};

/**
 * Method to place an image inside the container.
 *
 * This method removes any container's content and creates a new image HTML element
 * inside the container. If the image is not available on the given URL then this function
 * loads the default image that is passed as a defaultImage argument.
 *
 * The method adds special classes to the container, and implements some
 * workaround for IE in quirks mode.
 *
 * @param {Object} args
 * The object which contains attributes for the image.
 *
 * @param {HTMLElement} args.container
 * Specifies the target container.
 *
 * @param {String} args.image
 * The URL of the image to be loaded.
 *
 * @param {String} [args.defaultImage]
 * The URL of the default image.
 *
 * @param {Function} [args.onload]
 * The callback which fires when image is loaded.
 *
 * @param {Function} [args.onerror]
 * The callback which fires when loading image fails.
 *
 * @param {String} [args.position="fill"]
 * The position of an image inside the container. The only "fill" is implemented now.
*/
Utils.placeImage = function(args) {
	var position = args.position || "fill";

	args.container.addClass("echo-image-container");
	if (position === "fill") {
		args.container.addClass("echo-image-position-fill");
	}

	var image = Utils.loadImage({
		"image": args.image,
		"defaultImage": args.defaultImage,
		"onerror": args.onerror,
		"onload": function () {
			if (document.compatMode !== "CSS1Compat") {
				$(this).addClass(this.width < this.height
						? "echo-image-stretched-vertically"
						: "echo-image-stretched-horizontally");
			}
			$.isFunction(args.onload) && args.onload.apply(this, arguments);
		}
	});
	args.container.empty().append(image);
};

/**
 * @static
 * Function which accepts two arguments (numbers) as a range and
 * generates a random number in the given range.
 *
 *		Utils.random(1, 5); // returns a random number in range of [1, 5]
 *
 * @param {Number} min
 * Number which is the lower limit of the range
 *
 * @param {Number} max
 * Number which is the upper limit of the range
 *
 * @return {Number}
 * Random number in the [min, max] range
 */
Utils.random = function(min, max) {
	return min + Math.floor(Math.random() * (max - min + 1));
};

/**
 * @static
 * Renders info message in the target container.
 *
 * @param {Object} data
 * Object containing info message information.
 *
 * @param {String} [data.layout]
 * Specifies the type of message layout. Can be set to "compact" or "full".
 *
 * @param {HTMLElement} [data.target]
 * Specifies the target container.
 */
Utils.showMessage = function(data) {
	data.target.empty().append(
		this.substitute({
			"data": data,
			"template": data.template || Variables.templates.message[data.layout || "full"]
		})
	);
};

/**
 * @static
 * Renders error message in the target container.
 *
 * @param {Object} data
 * Object containing error message information.
 *
 * @param {Object} options
 * Object containing display options.
 */
Utils.showError = function(data, options) {
	var self = this;
	options = options || {};
	var getLabel = function(key) {
		return options.label || Variables.labels[key]
	};
	if (typeof options.retryIn === "undefined") {
		var label = getLabel("error_" + data.errorCode);
		var message = label === "error_" + data.errorCode
			? "(" + data.errorCode + ") " + (data.errorMessage || "")
			: label;
		this.showMessage({
			"type": options.critical ? "error" : "loading",
			"message": message,
			"target": options.target
		});
	} else if (!options.retryIn && options.promise) {
		this.showMessage({
			"type": "loading",
			"message": getLabel("retrying"),
			"target": options.target
		});
	} else if (options.promise) {
		var secondsLeft = options.retryIn / 1000;
		var ticker = function() {
			if (!secondsLeft) {
				return;
			}
			var label = self.substitute({
				"data": {"seconds": secondsLeft--},
				"template": getLabel("error_" + data.errorCode)
			});
			self.showMessage({
				"type": "loading",
				"message": label,
				"target": options.target
			});
		};
		var retryTimer = setInterval(ticker, 1000);
		options.promise.done(function() {
			clearInterval(retryTimer);
		});
		ticker();
	}
};

/**
 * @static
 * Method to calculate the relative time passed since the given date and time.
 *
 * @param {Mixed} datetime
 * The date to calculate how much time passed since that moment. The function recognizes
 * the date in W3CDFT or UNIX timestamp formats.
 *
 * @return {String}
 * String which represents the date and time in the relative format.
 */
Utils.getRelativeTime = function(datetime, options) {
	if (!datetime) return "";
	var ts = typeof datetime === "string"
		? Utils.timestampFromW3CDTF(datetime)
		: datetime;
	if (!ts) return "";
	var parts;
	options = options || {"labels": {}};
	var d = new Date(ts * 1000);
	var diff = Math.floor(((new Date()).getTime() - d.getTime()) / 1000);
	var getLabel = function(parts) {
		var numeric = parts[3];
		var plural = numeric && parts[4] > 1;
		var key = parts[0] + (plural ? "s" : "") + (numeric ? "Ago" : "");
		return Utils.substitute({
			"data": {"number": parts[4]},
			"template": options.labels[key] || Variables.labels[key]
		});
	};
	var conversions = [
		// we display the "Just now" text in order to mitigate the clock inaccuracy
		// when the time difference between the current and the given time is
		// less than 10 seconds or if the given date is "from the future" but
		// within the 60 seconds range
		["justNow", 10, false],
		["second", 60, true],
		["minute", 60, true],
		["hour", 24, true],
		["yerstaday", 48, false],
		["day", 7, true],
		["lastWeek", 14, false],
		["week", 30, true],
		["lastMonth", 60, false],
		["month", 365, true],
		null
	];

	for (var i = 0; i < conversions.length; i++) {
		parts = conversions[i];
		if (diff < parts[1]) {
			break;
		}
		diff = diff / parts[1];
	}

	if (!parts || isNaN(diff) || diff < -60) {
		return d.toLocaleDateString() + ", " + d.toLocaleTimeString();
	}

	return getLabel(parts.concat(Math.floor(diff)));
};


Variables.templates = {
	"message": {
		"compact": '<span class="echo-app-message echo-app-message-icon echo-app-message-{data:type} {class:messageIcon} {class:messageText}" title="{data:message}">&nbsp;</span>',
		"full": '<div class="echo-app-message {class:messageText}">' +
			'<span class="echo-app-message-icon echo-app-message-{data:type} {class:messageIcon}">' +
				'{data:message}' +
			'</span>' +
		'</div>'
	}
};

Variables.labels = {
	/**
	 * @echo_label loading
	 */
	"loading": "Loading...",
	/**
	 * @echo_label retrying
	 */
	"retrying": "Retrying...",
	/**
	 * @echo_label error_busy
	 */
	"error_busy": "Loading. Please wait...",
	/**
	 * @echo_label error_timeout
	 */
	"error_timeout": "Loading. Please wait...",
	/**
	 * @echo_label error_waiting
	 */
	"error_waiting": "Loading. Please wait...",
	/**
	 * @echo_label error_view_limit
	 */
	"error_view_limit": "View creation rate limit has been exceeded. Retrying in {seconds} seconds...",
	/**
	 * @echo_label error_view_update_capacity_exceeded
	 */
	"error_view_update_capacity_exceeded": "This stream is momentarily unavailable due to unusually high activity. Retrying in {seconds} seconds...",
	/**
	 * @echo_label error_result_too_large
	 */
	"error_result_too_large": "(result_too_large) The search result is too large.",
	/**
	 * @echo_label error_wrong_query
	 */
	"error_wrong_query": "(wrong_query) Incorrect or missing query parameter.",
	/**
	 * @echo_label error_incorrect_appkey
	 */
	"error_incorrect_appkey": "(incorrect_appkey) Incorrect or missing appkey.",
	/**
	 * @echo_label error_internal_error
	 */
	"error_internal_error": "(internal_error) Unknown server error.",
	/**
	 * @echo_label error_quota_exceeded
	 */
	"error_quota_exceeded": "(quota_exceeded) Required more quota than is available.",
	/**
	 * @echo_label error_incorrect_user_id
	 */
	"error_incorrect_user_id": "(incorrect_user_id) Incorrect user specified in User ID predicate.",
	/**
	 * @echo_label error_unknown
	 */
	"error_unknown": "(unknown) Unknown error.",
	/**
	 * @echo_label today
	 */
	"today": "Today",
	/**
	 * @echo_label justNow
	 */
	"justNow": "Just now",
	/**
	 * @echo_label yesterday
	 */
	"yesterday": "Yesterday",
	/**
	 * @echo_label lastWeek
	 */
	"lastWeek": "Last Week",
	/**
	 * @echo_label lastMonth
	 */
	"lastMonth": "Last Month",
	/**
	 * @echo_label secondAgo
	 */
	"secondAgo": "{number} Second Ago",
	/**
	 * @echo_label secondsAgo
	 */
	"secondsAgo": "{number} Seconds Ago",
	/**
	 * @echo_label minuteAgo
	 */
	"minuteAgo": "{number} Minute Ago",
	/**
	 * @echo_label minutesAgo
	 */
	"minutesAgo": "{number} Minutes Ago",
	/**
	 * @echo_label hourAgo
	 */
	"hourAgo": "{number} Hour Ago",
	/**
	 * @echo_label hoursAgo
	 */
	"hoursAgo": "{number} Hours Ago",
	/**
	 * @echo_label dayAgo
	 */
	"dayAgo": "{number} Day Ago",
	/**
	 * @echo_label daysAgo
	 */
	"daysAgo": "{number} Days Ago",
	/**
	 * @echo_label weekAgo
	 */
	"weekAgo": "{number} Week Ago",
	/**
	 * @echo_label weeksAgo
	 */
	"weeksAgo": "{number} Weeks Ago",
	/**
	 * @echo_label monthAgo
	 */
	"monthAgo": "{number} Month Ago",
	/**
	 * @echo_label monthsAgo
	 */
	"monthsAgo": "{number} Months Ago"
};

Utils.addCSS(
	'.echo-image-container.echo-image-position-fill { text-align: center; overflow: hidden; }' +
	'.echo-image-container.echo-image-position-fill img { max-width: 100%; max-height: 100%; width: auto; height: auto; vertical-align: top; }' +
	'.echo-image-container.echo-image-position-fill img.echo-image-stretched-horizontally { width: 100%; height: auto; }' +
	'.echo-image-container.echo-image-position-fill img.echo-image-stretched-vertically { width: auto; height: 100%; }' +
	'.echo-message { padding: 15px 0px; text-align: center; }' +
	'.echo-message-icon { height: 16px; padding-left: 16px; background: no-repeat left center; }' +
	'.echo-message .echo-message-icon { padding-left: 21px; height: auto; }' +
	'.echo-message-info { background-image: url({config:cdnBaseURL.sdk-assets}/images/information.png); }' +
	'.echo-message-loading { background-image: url({config:cdnBaseURL.sdk-assets}/images/loading.gif); }' +
	'.echo-message-error { background-image: url({config:cdnBaseURL.sdk-assets}/images/warning.gif); }'
, "echo-common");

// JS SDK can't guarantee proper UI elements rendering in quirks mode
// because the UI Framework (Twitter Bootstrap) doesn't support this mode.
// Adding the message about that to the browser console to let the user know.
if (document.compatMode === "BackCompat") {
	Utils.log({
		"type": "error",
		"message": "Quirks mode is not supported by JS SDK. Please make sure that the page has a valid doctype."
	});
}
	return Utils;
});
