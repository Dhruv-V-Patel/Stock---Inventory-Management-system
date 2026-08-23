const finishedStockService = require("../services/finishedStockService");

const getFinishedStock = async (req, res, next) => {
    try {
        const stock =
            await finishedStockService.getFinishedStock();

        return res.status(200).json({
            success: true,
            stock,
        });
    } catch (error) {
        return next(error);
    }
};

const getRecentMovements = async (req, res, next) => {
    try {
        const movements =
            await finishedStockService.getRecentMovements(
                req.query.limit,
            );

        return res.status(200).json({
            success: true,
            movements,
        });
    } catch (error) {
        return next(error);
    }
};

const getProductMovements = async (req, res, next) => {
    try {
        const movements =
            await finishedStockService.getProductMovements(
                req.params.productId,
            );

        return res.status(200).json({
            success: true,
            movements,
        });
    } catch (error) {
        return next(error);
    }
};

module.exports = {
    getFinishedStock,
    getRecentMovements,
    getProductMovements,
};
