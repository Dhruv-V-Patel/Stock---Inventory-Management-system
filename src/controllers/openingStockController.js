const openingStockService = require("../services/openingStockService");
const {
    getIpAddress,
    getUserId,
} = require("../utils/requestUtils");

const sendError = (res, error) => {
    console.error("[Opening Stock Controller]", error);

    return res.status(error.statusCode || 500).json({
        success: false,
        message:
            error.statusCode
                ? error.message
                : "Failed to process opening stock request.",
    });
};

const list = async (req, res) => {
    try {
        const data = await openingStockService.listOpeningStock({
            openingDate: req.query.opening_date || "",
            itemType: req.query.item_type || "",
            search: req.query.search || "",
        });

        return res.json({
            success: true,
            data,
        });
    } catch (error) {
        return sendError(res, error);
    }
};

const items = async (req, res) => {
    try {
        const data = await openingStockService.listItemsForOpeningStock({
            openingDate: req.query.opening_date || "",
            itemType: req.query.item_type || "",
            search: req.query.search || "",
        });

        return res.json({
            success: true,
            data,
        });
    } catch (error) {
        return sendError(res, error);
    }
};

const save = async (req, res) => {
    try {
        const data =
            await openingStockService.createOrUpdateOpeningStock({
                id: req.body?.id ? Number(req.body.id) : null,
                itemType: req.body?.item_type,
                itemId: req.body?.item_id,
                openingDate: req.body?.opening_date,
                quantity:
                    req.body?.quantity ??
                    req.body?.opening_stock,
                rate: req.body?.rate,
                remarks: req.body?.remarks ?? null,
                userId: getUserId(req),
                ipAddress: getIpAddress(req),
            });

        return res.status(req.body?.id ? 200 : 201).json({
            success: true,
            message: req.body?.id
                ? "Opening stock updated successfully."
                : "Opening stock saved successfully.",
            data,
        });
    } catch (error) {
        if (error.code === "23505") {
            return res.status(409).json({
                success: false,
                message: "Opening stock already exists for this item.",
            });
        }

        return sendError(res, error);
    }
};

const remove = async (req, res) => {
    try {
        const data =
            await openingStockService.deleteOpeningStock({
                id: Number(req.params.id),
                userId: getUserId(req),
                ipAddress: getIpAddress(req),
            });

        return res.json({
            success: true,
            message: data.message,
        });
    } catch (error) {
        return sendError(res, error);
    }
};

module.exports = {
    list,
    items,
    save,
    remove,
};
