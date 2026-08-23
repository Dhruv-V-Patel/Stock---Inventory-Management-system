const productCategoriesService =
  require("../services/productCategoriesService");

const listCategories = async (req, res) => {
  try {
    const categories =
      await productCategoriesService.listCategories();

    return res.status(200).json({
      success: true,
      categories,
    });
  } catch (error) {
    console.error(
      "[Product Categories] list:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to load categories.",
    });
  }
};

const createCategory = async (req, res) => {
  try {
    const category =
      await productCategoriesService.createCategory({
        name: req.body?.name,
      });

    return res.status(201).json({
      success: true,
      message: "Category created successfully.",
      category,
    });
  } catch (error) {
    console.error(
      "[Product Categories] create:",
      error
    );

    return res.status(error.statusCode || 500).json({
      success: false,
      message:
        error.statusCode
          ? error.message
          : "Failed to create category.",
    });
  }
};

module.exports = {
  listCategories,
  createCategory,
};