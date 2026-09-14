const db = require("../config/db");

// Add here
let io = null;

const setSocketIO = (socketIO) => {
    io = socketIO;
};

/**
 * Create a notification
 */
const createNotification = async ({
    title,
    message,
    type,
    referenceType = null,
    referenceId = null,
    createdBy = null,
}) => {
    const { rows } = await db.query(
        `
        INSERT INTO notifications (
            title,
            message,
            type,
            reference_type,
            reference_id,
            created_by
        )
        VALUES ($1,$2,$3,$4,$5,$6)
        RETURNING *;
        `,
        [
            title,
            message,
            type,
            referenceType,
            referenceId,
            createdBy,
        ]
    );

    const notification = rows[0];

    // Emit once for all connected clients
    if (io) {
        // console.log("📢 Emitting notification:new");
        io.emit("notification:new", notification);
    }

    return rows[0];
};
/**
 * Get notifications for a user
 */
const getNotifications = async (userId, limit) => {
    const { rows } = await db.query(
        // `
        // SELECT
        //     n.*,
        //     u.name AS created_by_name
        // FROM notifications n
        // LEFT JOIN users u
        //     ON u.id = n.created_by
        // ORDER BY n.created_at DESC
        // LIMIT $1
        // `,
        // [limit]
        `
        SELECT
            n.*,
            u.name AS created_by_name,
            (nr.notification_id IS NOT NULL) AS is_read
        FROM notifications n
        LEFT JOIN users u
            ON u.id = n.created_by
        LEFT JOIN notification_reads nr
            ON nr.notification_id = n.id
           AND nr.user_id = $1
        ORDER BY n.created_at DESC
        LIMIT $2
        `,
        [userId, limit]
    );


    return rows;
};

const markAllNotificationsRead = async (userId) => {
    await db.query(
        `
        INSERT INTO notification_reads (notification_id, user_id)
        SELECT id, $1
        FROM notifications
        ON CONFLICT (notification_id, user_id)
        DO NOTHING;
        `,
        [userId]
    );
};

module.exports = {
    createNotification,
    getNotifications,
    markAllNotificationsRead,
    setSocketIO,
};