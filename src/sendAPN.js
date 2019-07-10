const apn = require('node-apn-http2');

const method = 'apn';
const defaultExpiry = ttl => (typeof ttl === 'number' ? ttl : 28 * 86400) + Math.floor(Date.now() / 1000);

class APN {
    constructor(settings) {
        try {
            this.connection = new apn.Provider(settings);
        } catch (e) {
            this.connectionError = e;
            this.connection = null;
        }
    }

    shutdown() {
        if (this.connection) {
            this.connection.shutdown();
        }
    }

    sendAPN(regIds, data) {
        const message = new apn.Notification(data.custom || {});

        message.retryLimit = data.retries || -1;
        message.expiry = data.expiry || defaultExpiry(data.timeToLive);
        message.priority = data.priority === 'normal' ? 5 : 10;
        message.encoding = data.encoding;
        message.badge = data.badge;
        message.sound = data.sound;
        message.alert = data.alert || {
            title: data.title,
            body: data.body,
            'title-loc-key': data.titleLocKey,
            'title-loc-args': data.titleLocArgs,
            'loc-key': data.locKey,
            // bodyLocArgs is kept for backward compatibility
            'loc-args': data.locArgs || data.bodyLocArgs,
            'launch-image': data.launchImage,
            action: data.action,
        };
        message.topic = data.topic;
        message.category = data.category || data.clickAction;
        message.contentAvailable = data.contentAvailable;
        message.mdm = data.mdm;
        message.urlArgs = data.urlArgs;
        message.truncateAtWordEnd = data.truncateAtWordEnd;
        message.collapseId = data.collapseKey;
        message.mutableContent = data.mutableContent || 0;
        message.threadId = data.threadId;

        if (!this.connection) {
            return Promise.reject(this.connectionError || new Error('Unkown error: APN connection not configured properly'));
        }

        return this.connection.send(message, regIds)
            .then((response) => {
                const resumed = {
                    method,
                    success: 0,
                    failure: 0,
                    message: [],
                };
                (response.sent || []).forEach((token) => {
                    resumed.success += 1;
                    resumed.message.push({
                        regId: token,
                        error: null,
                    });
                });
                (response.failed || []).forEach((failure) => {
                    // See https://github.com/node-apn/node-apn/blob/master/doc/provider.markdown#failed
                    resumed.failure += 1;
                    if (failure.error) {
                        // A transport-level error occurred (e.g. network problem)
                        resumed.message.push({
                            regId: failure.device,
                            error: failure.error,
                            errorMsg: failure.error.message || failure.error,
                        });
                    } else {
                        // `failure.status` is the HTTP status code
                        // `failure.response` is the JSON payload
                        resumed.message.push({
                            regId: failure.device,
                            error: (failure.response.reason || failure.status)
                                ? new Error(failure.response.reason || failure.status)
                                : failure.response,
                            errorMsg: failure.response.reason || failure.status,
                        });
                    }
                });

                return resumed;
            });
    }
}

module.exports = APN;
