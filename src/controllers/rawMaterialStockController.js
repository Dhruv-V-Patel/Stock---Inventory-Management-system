const rawMaterialStockService = require("../services/rawMaterialStockService");

const getRawMaterialStock = async (req, res) => {
    try {
        const stock = await rawMaterialStockService.getRawMaterialStock();

        return res.status(200).json({
            success: true,
            stock,
        });
    } catch (error) {
        console.error("[Raw Material Stock Controller] getRawMaterialStock:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to load raw material stock.",
        });
    }
};

const getRawMaterialStockSummary = async (req, res) => {
    try {
        const summary =
            await rawMaterialStockService.getRawMaterialStockSummary();

        return res.status(200).json({
            success: true,
            summary,
        });
    } catch (error) {
        console.error(
            "[Raw Material Stock Controller] getRawMaterialStockSummary:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to load raw material stock summary.",
        });
    }
};

const getRawMaterialStockById = async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
            success: false,
            message: "Invalid raw material ID.",
        });
    }

    try {
        const material =
            await rawMaterialStockService.getRawMaterialStockById(id);

        if (!material) {
            return res.status(404).json({
                success: false,
                message: "Raw material not found.",
            });
        }

        return res.status(200).json({
            success: true,
            material,
        });
    } catch (error) {
        console.error(
            "[Raw Material Stock Controller] getRawMaterialStockById:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to load raw material stock.",
        });
    }
};

const getRawMaterialStockMovements = async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
            success: false,
            message: "Invalid raw material ID.",
        });
    }

    try {
        const material =
            await rawMaterialStockService.getRawMaterialStockById(id);

        if (!material) {
            return res.status(404).json({
                success: false,
                message: "Raw material not found.",
            });
        }

        const movements =
            await rawMaterialStockService.getRawMaterialStockMovements(id);

        return res.status(200).json({
            success: true,
            movements,
        });
    } catch (error) {
        console.error(
            "[Raw Material Stock Controller] getRawMaterialStockMovements:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to load stock movements.",
        });
    }
};

module.exports = {
    getRawMaterialStock,
    getRawMaterialStockSummary,
    getRawMaterialStockById,
    getRawMaterialStockMovements,
};
