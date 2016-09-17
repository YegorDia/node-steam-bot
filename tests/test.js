var config = require('config');
var SteamBot = require('./../index.js');
var chai = require('chai');
var should = chai.should();
var expect = chai.expect;

var loginDetails = config.get('test.bot_credentials');
var tradingDetails = config.get('test.trading_details');

describe('Steam trading bot tests', function() {
    var bot;
    var sentOffer;
    var tradingInventory = null;
    var botInventory = null;
    var itemsToReceive = [];
    var itemsToSend = [];

    this.timeout(120000);

    it('Should login with username + password + shared_secret', function(done) {
        bot = new SteamBot(loginDetails);
        bot.logIn();
        bot.on('loggedIn', function() {
            done();
        });
    });

    it('Should load partners inventory', function(done) {
        bot.getInventoryBySteamID(
            tradingDetails.steamID,
            config.get('test.appid'),
            config.get('test.contextid'),
            true,
            function (err, response) {
                if (!err) {
                    tradingInventory = response;
                    for (var i = 0; i < 5; i++) {
                        itemsToReceive.push({
                            appid: config.get('test.appid'),
                            contextid: config.get('test.contextid'),
                            assetid: tradingInventory[i].id
                        });
                    }
                    done();
                } else {
                    throw new Error('Failed to fetch inventory for user ' + tradingDetails.steamID);
                }
            }
        )
    });

    it('Should load bot\'s inventory', function(done) {
        bot.getInventory(
            config.get('test.appid'),
            config.get('test.contextid'),
            true,
            function (err, response) {
                if (!err) {
                    botInventory = response;
                    for (var i = 0; i < 5; i++) {
                        itemsToSend.push({
                            appid: config.get('test.appid'),
                            contextid: config.get('test.contextid'),
                            assetid: botInventory[i].id
                        });
                    }
                    done();
                } else {
                    throw new Error('Failed to fetch inventory for the bot');
                }
            }
        )
    });

    it('Should send trade offer with partner\'s items', function(done) {
        sentOffer = bot.sendTradeOffer(
            tradingDetails.steamID,
            tradingDetails.trade_token,
            itemsToReceive,
            [],
            'mocha test offer (receive)',
            true,
            function (err, tradeOfferStatus) {
                if (!err) {
                    tradeOfferStatus.should.be.equal('sent');
                    done();
                } else {
                    throw new Error('Failed to send trade offer to user ' + tradingDetails.steamID);
                }
            }
        )
    });

    it('Should get recently sent offer and confirm its status', function(done) {
        bot.getTradeOffer(sentOffer.id, function(err, offer) {
            if (!err) {
                offer.state.should.be.equal(2); // Pending (Ready to pickup)
                done();
            } else {
                throw new Error('Failed to send trade offer to user ' + tradingDetails.steamID);
            }
        });
    });

    it('Should decline recently sent offer and confirm, that its cancelled', function(done) {
        bot.cancelTradeOffer(sentOffer, function(err, result) {
            if (err) {
                throw new Error('Failed to cancel trade offered to user ' + tradingDetails.steamID);
            }

            bot.getTradeOffer(sentOffer.id, function(err, offer) {
                if (!err) {
                    offer.state.should.be.equal(6); // Cancelled
                    done();
                } else {
                    throw new Error('Failed to get trade offer sent to user ' + tradingDetails.steamID);
                }
            });
        });
    });

    it('Should send trade offer with bot\'s items', function(done) {
        sentOffer = bot.sendTradeOffer(
            tradingDetails.steamID,
            tradingDetails.trade_token,
            [],
            itemsToSend,
            'mocha test offer (send)',
            true,
            function (err, tradeOfferStatus) {
                if (!err) {
                    tradeOfferStatus.should.be.equal('pending');
                    done();
                } else {
                    throw new Error('Failed to send trade offer to user ' + tradingDetails.steamID);
                }
            }
        )
    });

    it('Should get recently sent offer and confirm its status (confirmed with authenticator) in maximum 10 seconds', function(done) {
        setTimeout(function() {
            bot.getTradeOffer(sentOffer.id, function(err, offer) {
                if (!err) {
                    offer.state.should.be.equal(2); // Pending (Ready to pickup)
                    done();
                } else {
                    throw new Error('Failed to send trade offer to user ' + tradingDetails.steamID);
                }
            });
        }, 10000);
    });

    it('Should decline recently sent offer and confirm, that its cancelled', function(done) {
        bot.cancelTradeOffer(sentOffer, function(err, result) {
            if (err) {
                throw new Error('Failed to cancel trade offered to user ' + tradingDetails.steamID);
            }

            bot.getTradeOffer(sentOffer.id, function(err, offer) {
                if (!err) {
                    offer.state.should.be.equal(6); // Cancelled
                    done();
                } else {
                    throw new Error('Failed to get trade offer sent to user ' + tradingDetails.steamID);
                }
            });
        });
    });
});
