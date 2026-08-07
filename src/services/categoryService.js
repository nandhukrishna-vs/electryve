import slugify from "slugify";
import Category from "../models/Category.js";
import { validateCategory } from "../validators/categoryValidator.js";

const getCategories = async ({ page = 1, search = "" }) => {

  const limit = 10;
  const skip = (page - 1) * limit;

  const filter = {
    isDeleted: false
  };

  if (search) {
    filter.name = {
      $regex: search,
      $options: "i"
    };
  }

  const categories = await Category.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const totalCategories = await Category.countDocuments(filter);

  return {
    categories,
    currentPage: page,
    totalPages: Math.ceil(totalCategories / limit),
    search
  };

};

const createCategory = async ({ body }) => {

  const validation = validateCategory(body);

  if (!validation.success) {
    return {
      success: false,
      errors: validation.errors
    };
  }

  const name = body.name.trim();

  const existingCategory = await Category.findOne({
    name: {
      $regex: `^${name}$`,
      $options: "i"
    },
    isDeleted: false
  });

  if (existingCategory) {
    return {
      success: false,
      message: "Category already exists"
    };
  }

  const category = new Category({
    name,
    slug: slugify(name, {
      lower: true,
      strict: true
    }),
    description: body.description
  });

  await category.save();

  return {
    success: true,
    message: "Category added successfully"
  };

};

const getCategoryById = async (id) => {

  return await Category.findById(id);

};

const updateCategory = async ({ id, body }) => {

  const validation = validateCategory(body);

  if (!validation.success) {
    return {
      success: false,
      errors: validation.errors
    };
  }

  const name = body.name.trim();

  const existingCategory = await Category.findOne({
    _id: { $ne: id },
    name: {
      $regex: `^${name}$`,
      $options: "i"
    },
    isDeleted: false
  });

  if (existingCategory) {
    return {
      success: false,
      message: "Category already exists"
    };
  }

  await Category.findByIdAndUpdate(id, {

    name,

    slug: slugify(name, {
      lower: true,
      strict: true
    }),

    description: body.description

  });

  return {
    success: true,
    message: "Category updated successfully"
  };

};

const toggleCategoryStatus = async (id) => {

  const category = await Category.findById(id);

  if (!category) {
    return {
      success: false,
      message: "Category not found"
    };
  }

  category.isListed = !category.isListed;

  await category.save();

  return {
    success: true,
    message: category.isListed
      ? "Category listed"
      : "Category unlisted"
  };

};

const deleteCategory = async (id) => {

  const category = await Category.findById(id);

  if (!category) {
    return {
      success: false,
      message: "Category not found"
    };
  }

  category.isDeleted = true;

  await category.save();

  return {
    success: true,
    message: "Category deleted successfully"
  };

};

export {
  getCategories,
  createCategory,
  getCategoryById,
  updateCategory,
  toggleCategoryStatus,
  deleteCategory
};