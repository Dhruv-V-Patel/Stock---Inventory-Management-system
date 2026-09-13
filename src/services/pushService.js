const pool = require("../config/db");
const webpush = require("../config/webPush");

const sendPushNotification = async (payload) => {

    const { rows } = await pool.query(`
        SELECT
            id,
            endpoint,
            p256dh,
            auth
        FROM push_subscriptions
    `);

    for (const row of rows) {

        const subscription = {
            endpoint: row.endpoint,
            keys: {
                p256dh: row.p256dh,
                auth: row.auth
            }
        };

        try {

            await webpush.sendNotification(
                subscription,
                JSON.stringify(payload)
            );

        } catch (error) {

            // Remove expired subscriptions
            if (error.statusCode === 404 || error.statusCode === 410) {

                await pool.query(
                    "DELETE FROM push_subscriptions WHERE id=$1",
                    [row.id]
                );

                console.log("Expired subscription removed");
            }
        }
    }
};

module.exports = {
    sendPushNotification
};