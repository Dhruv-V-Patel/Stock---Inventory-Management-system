const rawMaterialsService = require("../services/rawMaterialsService");

const isPositiveInteger = (value) => {
    const number = Number(value);
    return Number.isInteger(number) && number > 0;
};

const normalizeBody = (body = {}) => ({
    code: String(body.code ?? "").trim(),
    name: String(body.name ?? "").trim(),
    category: body.category == null
        ? null
        : String(body.category).trim().toLowerCase() || null,
    unit: String(body.unit ?? "").trim().toUpperCase(),
    minimum_stock: Number(body.minimum_stock ?? 0),
    is_active: body.is_active !== false
});

const validateBody = (body) => {
    if (!body.name) return "Material name is required.";
    if (body.name.length > 150) return "Material name cannot exceed 150 characters.";

    if (body.category && body.category.length > 100) {
        return "Category cannot exceed 100 characters.";
    }

    if (!body.unit) return "Unit is required.";
    if (body.unit.length > 20) return "Unit cannot exceed 20 characters.";

    if (!Number.isFinite(body.minimum_stock) || body.minimum_stock < 0) {
        return "Minimum stock must be zero or greater.";
    }

    return null;
};

const sendDbError = (res, error) => {
    console.error("[Raw Materials Controller]", error);

    if (error.code === "23505") {
        return res.status(409).json({
            message: "Material code already exists."
        });
    }

    if (error.code === "23503") {
        return res.status(409).json({
            message: "This raw material is referenced by existing records."
        });
    }

    return res.status(500).json({
        message: "Failed to process raw material request."
    });
};

const list = async (req, res) => {
    try {
        const data = await rawMaterialsService.listRawMaterials({
            search: req.query.search,
            category: req.query.category,
            status: req.query.status
        });

        return res.json({
            data
        });
    } catch (error) {
        return sendDbError(res, error);
    }
};

const summary = async (req, res) => {
    try {
        const data = await rawMaterialsService.getRawMaterialSummary();

        return res.json({
            data
        });
    } catch (error) {
        return sendDbError(res, error);
    }
};

const getById = async (req, res) => {
    const { id } = req.params;

    if (!isPositiveInteger(id)) {
        return res.status(400).json({
            message: "Invalid raw material ID."
        });
    }

    try {
        const data = await rawMaterialsService.getRawMaterialById(Number(id));

        if (!data) {
            return res.status(404).json({
                message: "Raw material not found."
            });
        }

        return res.json({
            data
        });
    } catch (error) {
        return sendDbError(res, error);
    }
};

const getNextCode = async (req, res) => {
    try {
        const code = await rawMaterialsService.getNextRawMaterialCode();

        return res.json({
            code
        });
    } catch (error) {
        return sendDbError(res, error);
    }
};

const create = async (req, res) => {
    const body = normalizeBody(req.body);
    const validationError = validateBody(body);

    if (validationError) {
        return res.status(400).json({
            message: validationError
        });
    }    
    try {
        body.code = await rawMaterialsService.getNextRawMaterialCode();

        const data = await rawMaterialsService.createRawMaterial(body);

        return res.status(201).json({
            message: "Raw material created successfully.",
            data
        });
    } catch (error) {
        return sendDbError(res, error);
    }
};

const update = async (req, res) => {
    const { id } = req.params;

    if (!isPositiveInteger(id)) {
        return res.status(400).json({
            message: "Invalid raw material ID."
        });
    }

    const body = normalizeBody(req.body);
    const validationError = validateBody(body);

    if (validationError) {
        return res.status(400).json({
            message: validationError
        });
    }

    try {
        const data = await rawMaterialsService.updateRawMaterial(
            Number(id),
            body
        );

        if (!data) {
            return res.status(404).json({
                message: "Raw material not found."
            });
        }

        return res.json({
            message: "Raw material updated successfully.",
            data
        });
    } catch (error) {
        return sendDbError(res, error);
    }
};

// const remove = async (req, res) => {
//     const { id } = req.params;

//     if (!isPositiveInteger(id)) {
//         return res.status(400).json({
//             message: "Invalid raw material ID."
//         });
//     }

//     try {
//         const data = await rawMaterialsService.deactivateRawMaterial(
//             Number(id)
//         );

//         if (!data) {
//             return res.status(404).json({
//                 message: "Raw material not found."
//             });
//         }

//         return res.json({
//             message: "Raw material deactivated successfully.",
//             data
//         });
//     } catch (error) {
//         return sendDbError(res, error);
//     }
// };

const remove = async (req, res) => {
    const { id } = req.params;

    if (!isPositiveInteger(id)) {
        return res.status(400).json({
            message: "Invalid raw material ID."
        });
    }

    try {
        const data = await rawMaterialsService.deleteRawMaterial(
            Number(id)
        );

        return res.json({
            message: "Raw material deleted successfully.",
            data
        });

    } catch (error) {
        console.error("[Raw Materials Controller] delete:", error);

        if (error.code === "RAW_MATERIAL_IN_USE") {
            return res.status(409).json({
                message: error.message,
                code: error.code,
                usedIn: error.usedIn || []
            });
        }

        return sendDbError(res, error);
    }
};

module.exports = {
    list,
    summary,
    getById,
    create,
    update,
    remove,
    getNextCode,
};
