/*jslint white:true, nomen: true, plusplus: true */
/*global mx, mxui, mendix, require, console, define, module, logger, declare */
/*mendix */
//logger.level(logger.ALL);

define([
    "dojo/_base/declare", "mxui/widget/_WidgetBase", "dijit/_TemplatedMixin",
    "mxui/dom", "dojo/dom", "dojo/_base/array", "dojo/_base/lang", "dojo/dom-construct", "dojo/dom-class",
    "dojo/on","mendix/lib/MxContext", "dijit/form/ComboBox",
    "refkit/lib/XPathSource",
    "refkit/lib/jquery",
    "dojo/text!refkit/templates/InputReferenceSelector.html"
], function (declare, _WidgetBase, _TemplatedMixin, dom, dojoDom, dojoArray, dojoLang, dojoConstruct, domClass, on, MxContext, ComboBox, XPathSource, _jQuery, template) {

    "use strict";

    var $ = _jQuery.noConflict(true);

    // Declare widget.
    return declare("refkit.widget.InputRefSelector", [ _WidgetBase, _TemplatedMixin ], {

        // Template path
        templateString: template,

        // Set by Modeler
        objreference : "",
        objattribute : "",
        constraints  : "",
        suggestions  : 5,
        fetchmethod  : "contains", // you want to have default for this
        autocomplete : true,
        onchangemf   : "",
        notfoundmf   : "",
        searchdelay  : 300,
        searchempty  : true,
        sortattrs    : "",
        sortorder    : "",

        // Internal
        sourceObject   : null,
        referredEntity : "",
        currentValue   : "",
        currentConstr  : "",

        sortParams     : null,
        xpathSource    : null,
        comboBox       : null,

        ignoreChange   : false,
        isInactive     : false,

        _handles: null,
        _contextObj: null,

        // dojo.declare.constructor is called to construct the widget instance. Implement to initialize non-primitive properties.
        constructor: function() {
            this._handles = [];
            // Uncomment next line to start debugging
            //logger.level(logger.DEBUG);
        },

        postCreate : function() {
            logger.debug(this.id + ".postCreate");
            this.sortParams = [];
            mendix.lang.sequence([
                dojoLang.hitch(this, this.actParseConfig),
                dojoLang.hitch(this, this.actSetupSource),
                dojoLang.hitch(this, this.actSetupInput)
            ]);
        },

        applyContext : function(context, callback) {
            logger.debug(this.id + ".applyContext", context, callback);
            var trackId = context && context.getTrackId();
            if (trackId) {
                var cs     = this.constraints,
                    constr = this.currentConstr = cs ? this.matchTokens(cs, context.getTrackId()) : "";
                if (constr !== cs) {
                    // update constraints
                    this.xpathSource.updateConstraints(constr);
                }
                mx.data.get({
                    guid     : trackId,
                    callback : this.setSourceObject.bind(this)
                });
            } else {
                this.setSourceObject(null);
            }

            if (callback) {
              callback();
            }
        },

        actParseConfig : function(callback) {
            logger.debug(this.id + ".parseConfig", callback);
            var splits    = this.objreference.split("/"),
                sortAttrs = this.sortattrs.split(";"),
                sortOrder = this.sortorder.split(";");

            this.name           = splits[0];
            this.objreference   = splits[0];
            this.referredEntity = splits[1];

            for (var i = 0, attr; attr = sortAttrs[i]; i++) {
                this.sortParams.push([attr, sortOrder[i]]);
            }

            if (callback) {
              callback();
            }
        },

        actSetupSource : function(callback) {
            logger.debug(this.id + ".actSetupSource", callback);

            this.xpathSource = new XPathSource({
                caller      : this.id,
                limit       : this.suggestions,
                entity      : this.referredEntity,
                attribute   : this.objattribute,
                constraints : this.constraints,
                fetchmethod : this.fetchmethod,
                searchempty : this.searchempty,
                sortorder   : this.sortParams
            });

            if (callback) {
                callback();
            }
        },

        actSetupInput : function(callback) {
            logger.debug(this.id + ".actSetupInput", callback);

                if (!this.comboBox) {
                    this.comboBox = new ComboBox({
                        store        : this.xpathSource,
                        queryExpr    : "${0}",
                        searchAttr   : this.objattribute,
                        searchDelay  : this.searchdelay,
                        tabIndex     : 0,
                        hasDownArrow : false,
                        autoComplete : this.autocomplete
                    });
                }

            this.domNode.appendChild(this.comboBox.domNode);
            on(this.comboBox, "change", this.valueChange.bind(this));
            this.comboBox.domNode.removeAttribute("tabIndex");

            if (callback) {
                callback();
            }
        },

        setSourceObject : function(obj) {
            logger.debug(this.id + ".setSourceObject", obj);

            this.sourceObject = obj;

            if (this._handles) {
                dojoArray.forEach(this._handles, function (handle) {
                    mx.data.unsubscribe(handle);
                });
                this._handles = [];
            }

            if (obj) {

                if (!this.isInactive) {
                    this.comboBox.attr("disabled", false);
                }

                var objectHandle = this.subscribe({
                    guid: obj.getGuid(),
                    callback: dojoLang.hitch(this, this.changeReceived)
                });

                var validationHandle = this.subscribe({
                    guid: obj.getGuid(),
                    val: true,
                    callback: dojoLang.hitch(this, this._handleValidation)
                });

                this._handles = [ objectHandle, validationHandle ];
                this.getReferredObject(obj.get(this.objreference));
            } else {
                this.comboBox.attr("disabled", true);
            }
        },

        objectUpdateNotification : function() {
            logger.debug(this.id + ".objectUpdateNotification", arguments);
            this.getReferredObject(this.sourceObject.get(this.objreference));
        },

        changeReceived : function(guid, attr, value) {
            logger.debug(this.id + ".changeReceived, change: ", arguments);
            if (!this.ignoreChange) {
                this.getReferredObject(value);
            }
        },

        getReferredObject : function(guid) {
            logger.debug(this.id + ".getReferredObject", guid);
            this.currentValue = guid;
            if (guid) {
                mx.data.get({
                    guid     : guid,
                    callback : function(obj) {
                        logger.debug(this.id + ".getReferredObject.callback", obj);
                        if (obj.isEnum(this.objattribute)){
                            this.setDisplayValue(obj.getEnumCaption(this.objattribute));
                        } else {
                            this.setDisplayValue(obj.get(this.objattribute));
                        }

                    }.bind(this)
                });
            } else {
                this.setDisplayValue("");
            }
        },

        setDisplayValue : function(value) {
            logger.debug(this.id + ".setDisplayValue", value);
            this.ignoreChange = true;
            this._clearValidations();

            if (this.comboBox) {
                this.comboBox.attr("value", value);
            }

            var self = this;

            $('div#' + this.id).focusin(function() {
                $(this).addClass('MxClient_Focus');
                $(this).css('outline', '#333 auto 2px');
                if ($('div#' + self.id + ' div').hasClass('dijitTextBoxFocused')) {
                    $('div#' + self.id + ' div').css('outline', 'rgb(0, 0, 0) auto 0px');
                }
            });

            $('div#' + this.id).focusout(function() {
                $(this).removeClass('MxClient_Focus');
                $(this).css('outline', 'transparent auto 0px');
            });

            setTimeout(function() { self.ignoreChange = false; }, 10);
        },

        valueChange : function(value, target) {
            logger.debug(this.id + ".valueChange", value, target);
            if (!this.ignoreChange) {
                this.ignoreChange = true;
                this.getGuid(dojoLang.hitch(this, function(guid) {
                    if (guid === "" && this.notfoundmf !== "") {
                        mx.data.create({
                            entity: this.referredEntity,
                            callback : function (obj) {
                                obj.set(this.objattribute, value);
                                mx.data.commit({
                                    mxobj: obj,
                                    callback : function () {}
                                });
                                this.sourceObject.addReference(this.objreference, obj.getGuid());
                                mx.data.commit({
                                    mxobj: this.sourceObject,
                                    callback : function () {
                                        this.ignoreChange = false;
                                        this.executeMF(this.notfoundmf);
                                    }.bind(this)
                                });
                            }.bind(this),
                            error    : function () {
                                // Error
                            },
                            context  : null
                        });
                    } else if (guid !== this.currentValue) {
                        this.sourceObject.set(this.objreference, this.currentValue = guid);
                        this.ignoreChange = false;
                        this.executeMF(this.onchangemf);
                    }
                }));
            }
        },

        resize: function () {},

        executeMF : function (mf) {
            logger.debug(this.id + ".executeMF", mf);
            if (mf) {
                var context = new MxContext();

                var params = {
                    applyto: "selection",
                    actionname: mf,
                    context: context,
                    guids: []
                };

                if (this.sourceObject) {
                    context.setContext(this.sourceObject.getEntity(), this.sourceObject.getGuid());
                    params.guids = [this.sourceObject.getGuid()];
                }

                mx.data.action({
                    params: params,
                    origin: this.mxform,
                    callback   : dojoLang.hitch(this, function() {
                        logger.debug(this.id + ".executeMF.OK");
                    }),
                    error      : dojoLang.hitch(this, function() {
                        logger.debug(this.id + ".executeMF.error");
                    })
                });
            }
        },

        // TODO: Recheck in 3.0
        matchTokens : function(str, mendixguid){
            logger.debug(this.id + ".matchTokens", arguments);
            var newstr = "";
            if (str !== null && str !== "") {
                newstr = str.match(/\[%CurrentObject%\]/) !== null ? str.replace(/\[%CurrentObject%\]/g, mendixguid) : str;
            }
            return newstr;
        },

        // TODO: use xpath from source
        getGuid : function(callback) {
            logger.debug(this.id + ".getGuid", callback);

            var value = this.comboBox.attr("value"),
                item  = this.comboBox.item;

            if (item) { // we already have an object
                callback(item.getGuid());
            } else if (value !== "") { // find an object that meets our requirements
                var attr   = this.objattribute,
                    method = this.fetchmethod == "startswith" ? "starts-with" : this.fetchmethod,
                    constr = "[" + method + "(" + attr + ",'" + value + "')";

                constr += method == "starts-with" ? " or " + attr + "='" + value + "']" : "]";

                var xpath = "//" + this.referredEntity + this.currentConstr + constr;

                mx.data.get({
                    xpath  : xpath,
                    filter : {
                        limit : 2 // then we know if there is more than one object meeting the constraint
                    },
                    callback : function(objs) {
                        if (objs.length === 1) {
                            callback(objs[0].getGuid());
                        } else {
                            logger.warn(this.id + ".onBlur: There is more than one object found, so change is ignored");
                            this.setDisplayValue("");
                            callback("");
                        }
                    },
                    error : function() {
                        // error
                    }
                }, this);
            } else {
                callback("");
            }
        },

        _setDisabledAttr : function(value) {
            logger.debug(this.id + "._setDisabledAttr");
            this.isInactive = !!value;
            this.comboBox.attr("disabled", this.isInactive);
        },

        _handleValidation: function(validations) {
            logger.debug(this.id + "._handleValidation");
            this._clearValidations();

            var validation = validations[0],
                message = validation.getReasonByAttribute(this.objreference);

            if (this.readOnly) {
                validation.removeAttribute(this.objreference);
            } else if (message) {
                this._addValidation(message);
                validation.removeAttribute(this.objreference);
            }
        },

        _clearValidations: function() {
            logger.debug(this.id + "._clearValidations");
            domClass.toggle(this.domNode, "has-error", false);
            dojoConstruct.destroy(this._alertDiv);
            this._alertDiv = null;
        },

        _showError: function(message) {
            logger.debug(this.id + "._showError");
            if (this._alertDiv !== null) {
                dojoHtml.set(this._alertDiv, message);
                return true;
            }
            this._alertDiv = dojoConstruct.create("div", {
                "class": "alert alert-danger",
                "innerHTML": message
            });
            dojoConstruct.place(this._alertDiv, this.domNode);
            domClass.toggle(this.domNode, "has-error", true);
        },

        _addValidation: function(message) {
            logger.debug(this.id + "._addValidation");
            this._showError(message);
        },

        uninitialize : function() {
            logger.debug(this.id + ".uninitialize");
            this.comboBox.destroyRecursive();
        }

    });
});
require(["refkit/widget/InputRefSelector"]);
