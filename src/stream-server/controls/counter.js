(function($) {

if (Echo.Utils.isComponentDefined("Echo.StreamServer.Controls.Counter")) return;

var counter = Echo.Control.skeleton("Echo.StreamServer.Controls.Counter");

counter.config = {
	"liveUpdatesTimeout": 10,
	"infoMessages": {"layout": "compact"}
};

$.map(["onPostComplete", "Plugins.Edit.onEditComplete"], function(name) {
	counter.events["Echo.StreamServer.Controls.Submit." + name] = {
		"context" : "global",
		"handler" : function() {
			this.get("request").send({"force": true});
		}
	};
});

counter.templates.main = "<span>{data:count}</span>";

counter.constructor = function() {
	// data can be defined explicitly
	// in this case we do not make API requests
	// TODO: no live updates for now if data is passed as a config value
	if ($.isEmptyObject(this.get("data"))) {
		this._request();
	} else {
		this.render();
	}
};

counter.methods.refresh = function() {
	this.showMessage({"type": "loading"});
	this.set("data", {});
	this._request();
	var component = Echo.Utils.getComponent("Echo.StreamServer.Controls.Counter");
	component.parent.refresh.call(this);
};

// internal functions

/* TODO: enable this function instead of the current one when:
         - Echo.API supports first and next requests in a single instance
         - when Transport will be able to handle config updates
counter.methods._request = function() {
	var request = this.get("request");
	if (!request) {
		request = Echo.StreamServer.API.request({
			"endpoint": "count",
			"method": "GET",
			"liveUpdatesTimeout": this.config.get("liveUpdatesTimeout"),
			"recurring": true,
			"onError": $.proxy(this._error, this),
			"onData": $.proxy(this._update, this)
		});
		this.set("requst", request);
	}
	request.config.set("data", {
		"q": this.config.get("query"),
		"appkey": this.config.get("appkey")
	});
	request.send();
};
*/

counter.methods._request = function() {
	var request = this.get("request");
	if (!request) {
		request = Echo.StreamServer.API.request({
			"endpoint": "count",
			"method": "GET",
			"data": {
				"q": this.config.get("query"),
				"appkey": this.config.get("appkey")
			},
			"onError": $.proxy(this._error, this),
			"onData": $.proxy(this._update, this)
		});
		this.set("requst", request);
	}
	request.send();
};

counter.methods._update = function(data) {
	if ($.isEmptyObject(this.data) || this.data.count != data.count) {
		this.set("data", data);
		this.render();
		this.events.publish({
			"topic": "onUpdate",
			"data": {
				"data": data,
				"query": this.config.get("query"),
				"target": this.config.get("target").get(0)
			}
		});
	}
};

counter.methods._error = function(data) {
	if (data.errorCode === "more_than") {
		this.set("data.count", data.errorMessage + "+");
		this.render();
	} else {
		this.showMessage({"type": "error", "data": data});
	}
};

Echo.Control.create(counter);

})(jQuery);
