const pool = require("../config/db");

const subscribe = async (req, res) => {
    try {

        const userId = req.user.id;

        const subscription = req.body;

        await pool.query(
            `
            INSERT INTO push_subscriptions
            (
                user_id,
                endpoint,
                p256dh,
                auth,
                browser,
                device
            )
            VALUES
            (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6
            )

            ON CONFLICT(endpoint)

            DO UPDATE

            SET

                user_id = EXCLUDED.user_id,

                p256dh = EXCLUDED.p256dh,

                auth = EXCLUDED.auth,

                browser = EXCLUDED.browser,

                device = EXCLUDED.device
            `,
            [
                userId,
                subscription.endpoint,
                subscription.keys.p256dh,
                subscription.keys.auth,
                subscription.browser || "",
                subscription.device || ""
            ]
        );

        res.json({
            success: true
        });

    }
    catch (error) {

        console.error(error);

        res.status(500).json({
            success:false
        });

    }

};

const unsubscribe = async(req,res)=>{

    try{

        await pool.query(

            `
            DELETE FROM push_subscriptions
            WHERE endpoint=$1
            `,

            [req.body.endpoint]

        );

        res.json({
            success:true
        });

    }

    catch(error){

        console.error(error);

        res.status(500).json({
            success:false
        });

    }

};

module.exports={
    subscribe,
    unsubscribe
};