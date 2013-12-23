Echo.define([
	"jquery",
	"echo/configuration",
	"echo/events",
	"echo/utils"
], function($, Configuration, Events, Utils) {

"use strict";

var API = {"Transports": {}, "Request": {}};

API.Transport = function(config) {
	this.config = new Configuration(config, {
		"data": {},
		"uri": "",
		"secure": false,
		"settings": {
			"crossDomain": true,
			"dataType": "json"
		},
		"onData": function() {},
		"onOpen": function() {},
		"onClose": function() {},
		"onError": function() {}
	});
	this._connect();
};

API.Transport.prototype._connect = function() {
	this.transportObject = this._getTransportObject();
};

API.Transport.prototype._wrapErrorResponse = function(responseError) {
	return {
		"result": "error",
		"errorCode": "connection_failure",
		"errorMessage": "",
		"transportError": responseError || ""
	};
};

API.Transport.prototype._prepareURL = function() {
	return this._getScheme() + "//" + this.config.get("uri");
};

/**
 * @ignore
 * @class Echo.API.Transports.WebSockets
 */
API.Transports.WebSockets = Utils.inherit(API.Transport, function(config) {
	if (!config || !config.uri) {
		Utils.log({
			"type": "error",
			"component": "Echo.API.Transports.WebSockets",
			"message": "Unable to initialize WebSockets transport, config is invalid",
			"args": {"config": config}
		});
		return;
	}
	config = $.extend(true, {
		"settings": {
			"maxConnectRetries": 3,
			"serverPingInterval": 30, // client-server ping-pong interval
			"protocols": ["liveupdate.ws.echoenabled.com"]
		}
	}, config || {});
	this.timers = {};
	this.subscriptionIds = {};
	this.unique = Utils.getUniqueString();
	API.Transports.WebSockets.parent.constructor.call(this, config);
});

API.Transports.WebSockets.socketByURI = {};

API.Transports.WebSockets.prototype.connecting = function() {
	return this.transportObject && this.transportObject.readyState === 0;
};

API.Transports.WebSockets.prototype.connected = function() {
	return this.transportObject && this.transportObject.readyState === 1;
};

API.Transports.WebSockets.prototype.closing = function() {
	return this.transportObject && this.transportObject.readyState === 2;
};

API.Transports.WebSockets.prototype.closed = function() {
	return this.transportObject && this.transportObject.readyState === 3;
};

API.Transports.WebSockets.prototype.subscribe = function(topic, params) {
	var id = Events.subscribe(
		$.extend(true, {
			"topic": "Echo.API.Transports.WebSockets." + topic,
			"context": this._context(this.unique)
		}, params)
	);
	this.subscriptionIds[topic] = this.subscriptionIds[topic] || [];
	this.subscriptionIds[topic].push(id);
	return id;
};

API.Transports.WebSockets.prototype.unsubscribe = function unsubscribe(arg) {
	var subscriptionIds, self = this;
	if (typeof arg === "string") {
		subscriptionIds = this.subscriptionIds[arg];
		if (subscriptionIds) {
			$.map(subscriptionIds, function(id) {
				Events.unsubscribe({"handlerId": id});
			});
			this.subscriptionIds[arg] = [];
		} else {
			$.each(this.subscriptionIds, function(topic, ids) {
				self.subscriptionIds[topic] = Utils.foldl([], ids, function(id, acc) {
					if (id.toString() === arg.toString()) {
						Events.unsubscribe({"handlerId": id});
					} else {
						acc.push(id);
					}
				});
			});
		}
	} else {
		$.each(this.subscriptionIds, $.proxy(unsubscribe, this));
		this.subscriptionIds = {};
	}
};

API.Transports.WebSockets.prototype.abort = function(force) {
	var socket = API.Transports.WebSockets.socketByURI[this.config.get("uri")];
	$.map(["onData", "onOpen", "onError"], $.proxy(this.unsubscribe, this));
	if (socket) {
		delete socket.subscribers[this.unique];
		// close socket connection if the last subscriber left
		if ($.isEmptyObject(socket.subscribers) || force) {
			if (this.connected()) {
				this.transportObject.close();
			}
		}
	}
};

API.Transports.WebSockets.prototype.send = function(event) {
	event.subscription = event.subscription || this.unique;
	return this.transportObject.send(Utils.objectToJSON(event));
};

API.Transports.WebSockets.prototype.keepConnection = function() {
	// establish periodical client-server ping-pong to keep connection alive
	var interval = this.config.get("settings.serverPingInterval") * 1000;
	this.timers.ping = setInterval($.proxy(this._ping, this), interval);
};

API.Transports.WebSockets.prototype.publish = function(topic, data) {
	this._publish(topic, data, this.unique);
};

// private functions

API.Transports.WebSockets.prototype._getScheme = function() {
	return this.config.get("secure") ? "wss:" : "ws:";
};

API.Transports.WebSockets.prototype._context = function(subscriptionId) {
	return this.config.get("uri").replace(/\//g, "-") + (subscriptionId ? "/" + subscriptionId : "");
};

API.Transports.WebSockets.prototype._getTransportObject = function() {
	var self = this, uri = this.config.get("uri");
	var sockets = API.Transports.WebSockets.socketByURI;
	$.map(["onOpen", "onClose", "onError", "onData"], function(topic) {
		self.subscribe(topic, {
			"handler": function(_, data) {
				self.config.get(topic)(data);
			},
			// when we receive data - send it to the appropriate
			// subscribers only (do not send it to all subscribers)
			"context": self._context(topic === "onData" ? self.unique : undefined)
		});
	});

	if (!sockets[uri]) {
		sockets[uri] = {
			"socket": this._prepareTransportObject(),
			"subscribers": {}
		};
	}
	// register socket subscriber
	sockets[uri].subscribers[this.unique] = true;

	return sockets[uri].socket;
};

API.Transports.WebSockets.prototype._prepareTransportObject = function() {
	var self = this;

	// return in case we are connected or connection is in progress
	if (this.connecting() || this.connected()) return;

	this._clearTimers();

	var Socket = window.WebSocket || window.MozWebSocket;
	var socket = new Socket(this._prepareURL(), this.config.get("settings.protocols"));
	socket.onopen = function() {
		// send ping immediately to make sure the server is responding
		self._ping(function() {
			self._publish("onOpen");
		});
		self.keepConnection();
	};
	socket.onmessage = function(event) {
		if (!event || !event.data) return;
		var data = $.parseJSON(event.data);
		self._publish("onData", data, data && data.subscription);
	};
	socket.onclose = function() {
		self._publish("onClose");
		self._clear();
	};
	socket.onerror = function(error) {
		self._publish("onError", self._wrapErrorResponse(error));
	};
	return socket;
};

API.Transports.WebSockets.prototype._resetRetriesAttempts = function() {
	this.attemptsRemaining = this.config.get("settings.maxConnectRetries");
};

API.Transports.WebSockets.prototype._clearTimers = function() {
	this.timers.ping && clearInterval(this.timers.ping);
	this.timers.pong && clearTimeout(this.timers.pong);
	this.timers = {};
};

API.Transports.WebSockets.prototype._clear = function() {
	var context = this.config.get("uri").replace(/\//g, "-");
	this._clearTimers();
	this.unsubscribe();
	$.map(["onData", "onOpen", "onClose", "onError"], function(name) {
		Events.unsubscribe({
			"topic": "Echo.API.Transports.WebSockets." + name,
			"context": context
		});
	});
	delete API.Transports.WebSockets.socketByURI[this.config.get("uri")];
};

API.Transports.WebSockets.prototype._publish = function(topic, data, subscriptionId) {
	Events.publish({
		"topic": "Echo.API.Transports.WebSockets." + topic,
		"data": data || {},
		"propagation": !subscriptionId,
		"global": false,
		"context": this._context(subscriptionId)
	});
};

API.Transports.WebSockets.prototype._ping = function(callback) {
	var self = this;
	var id = Events.subscribe({
		"topic": "Echo.API.Transports.WebSockets.onData",
		"handler": function(topic, data) {
			// we are expecting "pong" message only...
			if (!data || data.event !== "pong") return;

			clearTimeout(self.timers.pong);
			Events.unsubscribe({"handlerId": id});
			self._resetRetriesAttempts();

			callback && callback();
		},
		"context": this._context()
	});

	this.send({"event": "ping"});
	this.timers.pong = setTimeout(function() {
		Events.unsubscribe({"handlerId": id});
		self._tryReconnect();
	}, this.config.get("settings.serverPingInterval") * 1000);
};

API.Transports.WebSockets.prototype._tryReconnect = function() {
	// if we were disconnected and try to connect again - decrease
	// the retries counter to indicate several fail connection attempts in a row
	this.attemptsRemaining--;

	// exit when the connection attempt is scheduled (to prevent
	// multiple connections) or if no connection attempts left
	if (this.attemptsRemaining === 0) {
		this._reconnect();
	}
};

API.Transports.WebSockets.prototype._reconnect = function() {
	this.abort(true);
	this._connect();
};

API.Transports.WebSockets.available = function() {
	return !!(window.WebSocket || window.MozWebSocket);
};

/**
 * @ignore
 * @class Echo.API.Transports.AJAX
 */
API.Transports.AJAX = Utils.inherit(API.Transport, function(config) {
	config = $.extend({
		"method": "get"
	}, config || {});
	return API.Transports.AJAX.parent.constructor.call(this, config);
});

API.Transports.AJAX.prototype._getScheme = function() {
	return this.config.get("secure") ? "https:" : "http:";
};

API.Transports.AJAX.prototype._getTransportObject = function() {
	var self = this;
	return $.extend(true, {
		"url": this._prepareURL(),
		"type": this.config.get("method"),
		"error": function(errorResponse, requestParams) {
			errorResponse = self._wrapErrorResponse(errorResponse);
			if (errorResponse.transportError && errorResponse.transportError.statusText === "abort") {
				errorResponse.errorCode = "connection_aborted";
			}
			self.config.get("onError")(errorResponse, requestParams);
		},
		"success": this.config.get("onData"),
		"complete": this.config.get("onClose"),
		"beforeSend": function(jqXHR) {
			self.transportObject = jqXHR;
			self.config.get("onOpen").apply(null, arguments);
		}
	}, this.config.get("settings"));
};

API.Transports.AJAX.prototype._wrapErrorResponse = function(responseError) {
	var originalWrapped = API.Transports.AJAX.parent._wrapErrorResponse.apply(this, arguments);
	if (responseError && responseError.responseText) {
		var errorObject;
		try {
			errorObject = $.parseJSON(responseError.responseText);
		} catch(e) {}
		return errorObject || originalWrapped;
	}
	return originalWrapped;
};

API.Transports.AJAX.prototype.send = function(data) {
	var configData = this.config.get("data");
	data = typeof data === "string"
		? data
		: typeof configData === "string"
			? configData
			: $.extend({}, configData, data || {});
	if (typeof this.transportObject.status === "undefined") {
		this.transportObject = this._getTransportObject();
		this.transportObject.data = data;
		this.transportObject = $.ajax(this.transportObject);
	} else {
		$.ajax(
			$.extend(this._getTransportObject(), {
				"data": data
			})
		);
	}
};

API.Transports.AJAX.prototype.abort = function() {
	// check that transport object initialized by $.ajax function
	// instead of initializing by constructor
	if (this.transportObject && this.transportObject.abort) {
		this.transportObject.abort();
	}
};

API.Transports.AJAX.available = function() {
	return $.support.cors;
};

/**
 * @ignore
 * @class Echo.API.Transports.XDomainRequest
 */
API.Transports.XDomainRequest = Utils.inherit(API.Transports.AJAX, function() {
	return API.Transports.XDomainRequest.parent.constructor.apply(this, arguments);
});

API.Transports.XDomainRequest.prototype._getTransportObject = function() {
	var obj = API.Transports.XDomainRequest.parent._getTransportObject.call(this);
	var domain = Utils.parseURL(document.location.href).domain;
	var targetDomain = Utils.parseURL(this.config.get("uri")).domain;
	if (domain === targetDomain) {
		return obj;
	}
	// jQuery.XDomainRequest.js
	// Author: Jason Moon - @JSONMOON
	// IE8+
	// link: https://github.com/MoonScript/jQuery-ajaxTransport-XDomainRequest
	if (!$.support.cors && window.XDomainRequest) {
		var jsonRegEx = /\/json/i;
		var xmlRegEx = /\/xml/i;

		// ajaxTransport exists in jQuery 1.5+
		$.ajaxTransport("text html xml json", function(options, userOptions, jqXHR) {
			var xdr = null;
			var userType = (userOptions.dataType || "").toLowerCase();
			return {
				"send": function(headers, complete) {
					xdr = new window.XDomainRequest();
					if (/^\d+$/.test(userOptions.timeout)) {
						xdr.timeout = userOptions.timeout;
					}
					xdr.ontimeout = function() {
						complete(500, "timeout");
					};
					xdr.onload = function() {
						var allResponseHeaders = "Content-Length: " + xdr.responseText.length + "\r\nContent-Type: " + xdr.contentType;
						var status = {
							"code": 200,
							"message": "success"
						};
						var responses = {
							"text": xdr.responseText
						};
						try {
							if ((userType === "json") || ((userType !== "text") && jsonRegEx.test(xdr.contentType))) {
								try {
									responses.json = $.parseJSON(xdr.responseText);
								} catch(e) {
									status.code = 500;
									status.message = "parseerror";
								}
							} else if ((userType === "xml") || ((userType !== "text") && xmlRegEx.test(xdr.contentType))) {
								var doc = new window.ActiveXObject("Microsoft.XMLDOM");
								doc.async = false;
								try {
									doc.loadXML(xdr.responseText);
								} catch(e) {
									doc = undefined;
								}
								if (!doc || !doc.documentElement || doc.getElementsByTagName("parsererror").length) {
									status.code = 500;
									status.message = "parseerror";
									throw "Invalid XML: " + xdr.responseText;
								}
								responses.xml = doc;
							}
						} catch(parseMessage) {
							throw parseMessage;
						} finally {
							complete(status.code, status.message, responses, allResponseHeaders);
						}
					};
					xdr.onerror = function() {
						complete(500, "error", {
							"text": xdr.responseText
						});
					};
					var postData = typeof userOptions.data === "string"
						? userOptions.data
						: $.param(userOptions.data || "");
					xdr.open(options.type, options.url);
					xdr.send(postData);
				},
				"abort": function() {
					if (xdr) {
						xdr.abort();
					}
				}
			};
		});
	}
	// avoid caching the respond result
	return $.extend(obj, {
		"cache": false
	});
};

API.Transports.XDomainRequest.available = function(config) {
	config = config || {"method": "", "secure": false};
	var scheme = config.secure ? "https:" : "http:";
	// XDomainRequests must be: GET or POST methods, HTTP or HTTPS protocol,
	// and same scheme as calling page
	var transportSpecAvailability = /^get|post$/i.test(config.method)
		&& /^https?/.test(scheme)
		&& document.location.protocol === scheme;
	return "XDomainRequest" in window
		&& transportSpecAvailability;
};

/**
 * @ignore
 * @class Echo.API.Transports.JSONP
 */
API.Transports.JSONP = Utils.inherit(API.Transports.AJAX, function(config) {
	return API.Transports.JSONP.parent.constructor.apply(this, arguments);
});

API.Transports.JSONP.prototype.send = function(data) {
	if (this.config.get("method").toLowerCase() === "get") {
		return API.Transports.JSONP.parent.send.apply(this, arguments);
	}
	this._pushPostParameters($.extend({}, this.config.get("data"), data));
	this.transportObject.form.submit();
	this.config.get("onData")();
};

API.Transports.JSONP.prototype.abort = function() {
	if (this.transportObject.form && this.transportObject.iframe) {
		this.transportObject.form.remove();
		this.transportObject.iframe.remove();
		return;
	}
	return API.Transports.JSONP.parent.abort.call(this);
};

API.Transports.JSONP.prototype._getTransportObject = function() {
	var settings = API.Transports.JSONP.parent._getTransportObject.call(this);
	if (this.config.get("method").toLowerCase() === "post") {
		return this._getPostTransportObject({
			"url": settings.url
		});
	}
	delete settings.xhr;
	settings.dataType = "jsonp";
	return settings;
};

API.Transports.JSONP.prototype._getPostTransportObject = function(settings) {
	var id = "echo-post-" + Math.random();
	var container =
		$("#echo-post-request").length
			? $("#echo-post-request").empty()
			: $('<div id="echo-post-request"/>').css({"height": 0}).prependTo("body");
	// it won't work if the attributes are specified as a hash in the second parameter
	this.iframe = this.iframe || $('<iframe id="' + id + '" name="' + id + '" width="0" height="0" frameborder="0" border="0"></iframe>').appendTo(container);
	var form = $("<form/>", {
		"target" : id,
		"method" : "POST",
		"enctype" : "application/x-www-form-urlencoded",
		"acceptCharset" : "UTF-8",
		"action" : settings.url
	}).appendTo(container);
	this._pushPostParameters(settings.data);
	return {
		"form": form,
		"iframe": this.iframe
	};
};

API.Transports.JSONP.prototype._pushPostParameters = function(data) {
	var self = this;
	$.each(data || {}, function(key, value) {
		$("<input/>", {
			"type" : "hidden",
			"name" : key,
			"value" : value
		}).appendTo(self.transportObject.form);
	});
	return self.transportObject;
};

API.Transports.JSONP.available = function() {
	return true;
};

// FIXME: __DEPRECATED__
// remove this after full require js compatible implementation
Utils.set(window, "Echo.API.Transports", API.Transports);

/**
 * @class Echo.API.Request
 * Class implementing API requests logic on the transport layer.
 *
 * @package apps.sdk.js
 * @module
 */
/*
 * @constructor
 * @param {Object} config
 * Configuration data.
 */
API.Request = function(config) {
	var self = this;
	/**
	 * @cfg {String} endpoint
	 * Specifes the API endpoint.
	 */
	if (!config || !config.endpoint) {
		Utils.log({
			"type": "error",
			"component": "Echo.API",
			"message": "Unable to initialize API request, config is invalid",
			"args": {"config": config}
		});
		return {};
	}

	this.config = new Configuration(config, {
		/**
		 * @cfg {Function} [onData]
		 * Callback called after API request succeded.
		 */

		/**
		 * @cfg {Function} [onError]
		 * Callback called after API request failed.
		 */

		/**
		 * @cfg {Function} [onOpen]
		 * Callback called before sending an API request.
		 */

		/**
		 * @cfg {Function} [onClose]
		 * Callback called after API request aborting.
		 */

		/**
		 * @cfg {String} [apiBaseURL]
		 * Specifies the base URL for API requests
		 */
		"apiBaseURL": "{%=baseURLs.api.streamserver%}/v1/",

		/**
		 * @cfg {Object|String} [data]
		 * Data to be sent to the server. It is converted to a query string,
		 * if not already a string. Object must be key/value pairs.
		 */
		"data": {},

		/**
		 * @cfg {Object} [settings]
		 * A set of the key/value pairs to configure the transport object.
		 * This configuration is passed to the transport object through the
		 * jQuery's ajaxSettings field.
		 * For more info see http://api.jquery.com/jQuery.ajax/.
		 * Note: according to the link above, for some transports these settings
		 * have no effect.
		 */
		"onOpen": $.noop,
		"onData": $.noop,
		"onError": $.noop,
		"onClose": $.noop,

		/**
		 * @cfg {String} [transport]
		 * Specifies the transport name. The following transports are available:
		 *
		 *  + "websockets"
		 *  + "ajax"
		 *  + "jsonp"
		 *  + "XDomainRequest" (only supported in IE8+)
		 *
		 */
		"transport": "ajax",

		/**
		 * @cfg {String} [method]
		 * Specifies the request method. The following methods are available:
		 *
		 *  + "GET"
		 *  + "POST"
		 *
		 */
		"method": "GET",

		/**
		 * @cfg {Boolean} [secure]
		 * There is a flag which indicates what protocol will be used in, secure or not.
		 * If this parameter is not set, internally the lib will decide on the URL scheme.
		 */
		"secure": false,

		/**
		 * @cfg {Number} [timeout]
		 * Specifies the number of seconds after which the onError callback
		 * is called if the API request failed.
		 */
		"timeout": 30
	}, function(key, value) {
		return self._configNormalizers[key]
			? self._configNormalizers[key].call(self, value)
			: value;
	});
	this.deferred = {
		"transport": $.Deferred()
	};
	this.transport = this._getTransport();
};

API.Request.prototype._configNormalizers = {
	"transport": function(transport) {
		if (typeof transport === "string") {
			return this._normalizeTransportName(transport) || this._normalizeTransportName("ajax");
		} else {
			return this._normalizeTransportName("ajax");
		}
	}
};

API.Request.prototype._isSecureRequest = function(url) {
	var parts, secure = this.config.get("secure");
	var re = /https|wss/;
	if (secure) return secure;
	parts = Utils.parseURL(url);
	return re.test(window.location.protocol) || re.test(parts.scheme);
};

/**
 * Method performing the API request using the given parameters.
 *
 * @param {Object} [args] Request parameters.
 * @param {Boolean} [args.force] Flag to initiate aggressive polling.
 */
API.Request.prototype.send = function(args) {
	var force = false;
	if (args) {
		force = args.force;
		delete args.force;
		this.config.extend(args);
		this.transport.config.extend(args);
	}
	var method = this["_" + this.config.get("endpoint")];
	method && method.call(this, force);
	return this.deferred.transport.promise();
};

//TODO: probably we should replace request with _request or simply not documenting it
API.Request.prototype.request = function(params) {
	var self = this;
	var timeout = this.config.get("timeout");
	if (this.transport) {
		this.transport.config.extend(
			$.extend(
				true,
				this.transport.config.getAsHash(),
				this._getTransportConfig()
			)
		);
		if (timeout && this.config.get("onError")) {
			this._timeoutId = setTimeout(function() {
				self.config.get("onError")({
					"result": "error",
					"errorCode": "network_timeout"
				}, {
					"critical": true
				});
				self.transport.abort();
			}, timeout * 1000);
		}
		this.transport.send(params);
	}
	return this.deferred.transport.promise();
};

API.Request.prototype.abort = function() {
	this.transport && this.transport.abort();
	clearTimeout(this._timeoutId);
	if (this.deferred.transport) {
		this.deferred.transport.reject();
	}
};

API.Request.prototype._normalizeTransportName = function(transport) {
	return Utils.foldl("", API.Transports, function(constructor, acc, name) {
		if (transport.toLowerCase() === name.toLowerCase()) {
			return name;
		}
	});
};

API.Request.prototype._getTransport = function() {
	var self = this;
	var isSecure = this._isSecureRequest(this._prepareURL());
	var userDefinedTransport = this.config.get("transport");
	var transport = API.Transports[userDefinedTransport] && API.Transports[userDefinedTransport].available()
		? userDefinedTransport
		: (function() {
			var transport;
			$.each(["WebSockets", "AJAX", "XDomainRequest", "JSONP"], function(i, name) {
				var available = API.Transports[name].available({
					"secure": isSecure,
					"method": self.config.get("method")
				});
				if (available) {
					transport = name;
					return false;
				}
			});
			return transport;
		})();
	return new API.Transports[transport](this._getTransportConfig());
};

API.Request.prototype._getTransportConfig = function() {
	var url = this._prepareURL();
	return $.extend(this._getHandlersByConfig(), {
		"uri": url.replace(/^(?:(?:http|ws)s?:)?\/\//, ""),
		"data": this.config.get("data"),
		"method": this.config.get("method"),
		"secure": this._isSecureRequest(url),
		"settings": this.config.get("settings")
	});
};

API.Request.prototype._getHandlersByConfig = function() {
	var self = this;
	return Utils.foldl({}, this.config.getAsHash(), function(value, acc, key) {
		var handler;
		if (/^on[A-Z]/.test(key) && $.isFunction(value)) {
			handler = key !== "onOpen"
				? function() {
					var args = Array.prototype.slice.call(arguments);
					clearTimeout(self._timeoutId);
					value.apply(null, arguments);
					(self.deferred.transport[{
						"onData": "notifyWith",
						"onError": "rejectWith",
						"onClose": "resolveWith"
					}[key]] || $.noop)
					.call(self.deferred.transport, null, args);
					if (key === "onClose" || key === "onError") {
						self.deferred.transport = $.Deferred();
					}
				}
				: value;
			acc[key] = handler;
		}
	});
};

API.Request.prototype._prepareURL = function() {
	return this.config.get("apiBaseURL") + this.config.get("endpoint");
};

// FIXME: __DEPRECATED__
// remove this after full require js compatible implementation
Utils.set(window, "Echo.API.Request", API.Request);

return API;

});
