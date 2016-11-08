var config = require('config');
var SteamUser = require('steam-user');
var SteamCommunity = require('steamcommunity');
var TradeOfferManager = require('steam-tradeoffer-manager');
var SteamTotp = require('steam-totp');
//var SteamIdConventor = require('steam-id-convertor');

// Object constructor
function SteamBot(logInData) {
    var self = this;

    this.steamID = null;
    this.username = null;
    this.password = null;
    this.sharedSecret = null;
    this.identitySecret = null;

    this.loggedIn = false;
    this.lastLogin = null;
    this.cookies = null;
    this.sessionID = null;
    this.inventories = null;
    this.processingOffers = true;

    this.steamUser = new SteamUser();
    this.steamCommunity = new SteamCommunity();
    this.steamTrade = new TradeOfferManager({
        steam: self.steamUser,
        community: self.steamCommunity,
        cancelTime: config.get('trade_offers.cancel_time_seconds') * 1000,
        pendingCancelTime: config.get('trade_offers.pending_cancel_time_seconds') * 1000,
        cancelOfferCount: config.get('trade_offers.cancel_outdated_count') * 1000,
        cancelOfferCountMinAge: config.get('trade_offers.cancel_if_threshold_seconds') * 1000,
        language: 'en',
        pollInterval: config.get('trade_offers.check_interval_seconds') * 1000
    });

    if (logInData != undefined && logInData != null && 'username' in logInData && 'password' in logInData) {
        this.username = logInData.username;
        this.password = logInData.password;

        if ('shared_secret' in logInData) {
            this.sharedSecret = logInData.shared_secret;
        }
        if ('identity_secret' in logInData) {
            this.identitySecret = logInData.identity_secret;
        }
    } else {
        throw new Error('username and password are required in logInData');
    }

    self.steamUser.on('webSession', function (sessionID, cookies) {
        if (self.sessionID != sessionID || self.cookies != cookies) {
            self.sessionID = sessionID;
            self.cookies = cookies;
        }

        if (self.cookies) {
            self.steamCommunity.setCookies(cookies);
            self.steamTrade.setCookies(cookies);

            self.loggedIn = true;
            self.lastLogin = Date.now();
        }

        self.steamUser.on('friendOrChatMessage', function (senderID, message, room) {
            //console.log('\tMessage from ' + senderID + ': ' + message);

            self.emit('friendOrChatMessage', senderID, message, room);
        });

        self.steamTrade.on('sentOfferChanged', function (offer, oldState) {
            self.emit('offerChanged', offer, oldState);
        });

        self.steamTrade.on('receivedOfferChanged', function (offer, oldState) {
            self.emit('offerChanged', offer, oldState);
        });

        self.steamTrade.on('newOffer', function (offer) {
            self.emit('newOffer', offer);
        });

        //self.steamUser.on('tradeOffers', function (count) {
        //    self.emit('tradeOffers', count);
        //});

        console.log('Logged In with WebSession');
        self.emit('loggedIn');

        self.steamCommunity.startConfirmationChecker(30000, "identitySecret");
    });

    self.steamCommunity.on('sessionExpired', function(err) {
        self.steamCommunity.stopConfirmationChecker();
        self.logOff(function () {
            self.logIn();
        });
    });

    self.processingInterval = setInterval(function() {
        if (self.processingOffers === true) {
            self.processingOffers = false;
        }
    }, (50 * 1000));

    self.relogInterval = setInterval(function() {
        if (self.processingOffers === false) {
            self.steamCommunity.stopConfirmationChecker();
            self.logOut(function() {
                self.logIn();
            });
        }
    }, (60 * 60 * 1000));

    self.steamUser.on('error', function (e) {
        console.log(e);
        switch (e.eresult) {
            case 5:
                self.emit('incorrectCredentials', e);
                break;
            default:
                self.emit('debug', e);
        }
    });
}

// Bot methods
SteamBot.prototype.logIn = function () {
    var self = this;

    console.log('Logging On with ' + self.username);

    var credentials = {
        accountName: self.username,
        password: self.password
    };

    if (self.sharedSecret) {
        self.steamUser.setOption('promptSteamGuardCode', false);
        credentials.twoFactorCode = SteamTotp.getAuthCode(self.sharedSecret);
    }

    credentials.rememberPassword = true;
    credentials.logonId = 100;
    self.steamUser.logOn(credentials);

    self.steamUser.on('loggedOn', function (details) {
        console.log('Logged On!');
        self.steamUser.setPersona(SteamUser.Steam.EPersonaState.Online);
        self.emit('loggedOn', details);
    });
};

SteamBot.prototype.logOut = function (callback) {
    var self = this;
    console.log('Logging Out');
    self.steamUser.logOff();
    setTimeout(function() {
        if (callback) {
            callback();
        }
    }, 5000);
};

SteamBot.prototype.sendTradeOffer = function (recipientSteamID64, tradeToken, itemsToReceive, itemsToSend, message, autoConfirm, callback) {
    var self = this;
    self.processingOffers = true;

    //var recipientSteamID32 = SteamIdConventor.to32(recipientSteamID64).toString();
    var newOffer = self.steamTrade.createOffer(recipientSteamID64, tradeToken);
    var itemsToSendConfirmed = [];
    var itemsToReceiveConfirmed = [];
    var confirmAfter = autoConfirm || false;

    for (var i = 0; i < itemsToSend.length; i++) {
        var sendingItem = itemsToSend[i];
        if (sendingItem.appid !== undefined && sendingItem.assetid !== undefined) {
            var confirmedSendingItem = {
                appid: sendingItem.appid,
                assetid: sendingItem.assetid.toString()
            };

            if (sendingItem.contextid === undefined) {
                confirmedSendingItem.contextid = 2;
            } else {
                confirmedSendingItem.contextid = sendingItem.contextid;
            }

            if (sendingItem.amount === undefined) {
                confirmedSendingItem.amount = 1;
            } else {
                confirmedSendingItem.amount = sendingItem.amount;
            }

            itemsToSendConfirmed.push(confirmedSendingItem);
        }
    }

    for (var j = 0; j < itemsToReceive.length; j++) {
        var receiveItem = itemsToReceive[j];
        if (receiveItem.appid !== undefined && receiveItem.assetid !== undefined) {
            var confirmedReceiveItem = {
                appid: receiveItem.appid,
                assetid: receiveItem.assetid.toString()
            };

            if (receiveItem.contextid === undefined) {
                confirmedReceiveItem.contextid = 2;
            } else {
                confirmedReceiveItem.contextid = receiveItem.contextid.toString();
            }

            if (receiveItem.amount === undefined) {
                confirmedReceiveItem.amount = 1;
            } else {
                confirmedReceiveItem.amount = receiveItem.amount.toString();
            }

            itemsToReceiveConfirmed.push(confirmedReceiveItem);
        }
    }

    newOffer.addMyItems(itemsToSendConfirmed);
    newOffer.addTheirItems(itemsToReceiveConfirmed);

    newOffer.setMessage(message);

    newOffer.send(function (err, status) {
        if (!err) {
            console.log('\tSent trade offer with status: ' + status);
            self.emit('tradeofferSent', status);

            if (confirmAfter === true) {
                self.confirmAllUnacceptedTrades();
            }
        } else {
            console.log('\tSending trade offer error: ' + err);
            self.emit('tradeofferSendError', err);
        }

        if (callback) {
            self.processingOffers = false;
            callback(err, status);
        }
    });

    return newOffer;
};

SteamBot.prototype.generateConfirmationCode = function (time, tag) {
    var self = this;
    self.processingOffers = true;
    if (self.identitySecret) {
        return SteamTotp.generateConfirmationKey(self.identitySecret, time, tag);
    } else {
        throw new Error('identity_secret is required to generate confirmation codes');
    }
};

SteamBot.prototype.getConfirmations = function (time, key, confirmationsCallback) {
    var self = this;
    self.processingOffers = true;
    self.steamCommunity.getConfirmations(time, key, function() {
        self.processingOffers = false;
        confirmationsCallback();
    });
};

SteamBot.prototype.confirmAllUnacceptedTrades = function () {
    var self = this;
    self.processingOffers = true;
    var time = SteamTotp.time();

    self.getConfirmations(time, self.generateConfirmationCode(time, "conf"), function (err, confirmations) {
        if (err) {
            self.emit('error', {code: 503, msg: "Failed to fetch confirmations"});
            setTimeout(self.confirmAllUnacceptedTrades(), config.get('trade_offers.confirmations_retry_timeout_seconds') * 1000);
        }
        else {
            for (var confirmId in confirmations) {
                if (confirmations.hasOwnProperty(confirmId)) {
                    confirmations[confirmId].respond(time, self.generateConfirmationCode(time, 'allow'), true, function (err) {
                        if (err) {
                            console.log('\tConfirmation error: ' + err);
                            //self.emit('error', {code: 503, msg: 'Failed to accept confirmation'});
                        }
                    });
                }
            }
        }
        self.processingOffers = false;
    });
};

SteamBot.prototype.getInventory = function (appid, contextid, tradableOnly, inventoryCallback) {
    var self = this;
    self.processingOffers = true;
    self.steamTrade.loadInventory(appid, contextid, tradableOnly, inventoryCallback);
};

SteamBot.prototype.getInventoryBySteamID = function (steamID, appid, contextid, tradableOnly, inventoryCallback) {
    var self = this;
    self.processingOffers = true;
    self.steamTrade.loadUserInventory(steamID, appid, contextid, tradableOnly, inventoryCallback);
};

SteamBot.prototype.getTradeOffer = function (tradeofferId, callback) {
    var self = this;
    self.processingOffers = true;
    self.steamTrade.getOffer(tradeofferId, function (err, offer) {
        if (!err) {
            callback(null, offer);
            self.processingOffers = false;
        } else {
            callback(err, offer);
            self.processingOffers = false;
        }
    });
};

SteamBot.prototype.cancelTradeOffer = SteamBot.prototype.declineTradeOffer = function (tradeOffer, callback) {
    self.processingOffers = true;
    tradeOffer.cancel(callback);
};

SteamBot.prototype.__proto__ = require('events').EventEmitter.prototype;

// Export the class
module.exports = SteamBot;