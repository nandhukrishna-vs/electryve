import slugify from "slugify";
import Brand from "../models/Brand.js";
import { validateBrand } from "../validators/brandValidator.js";

const getBrands = async ({ page = 1, search = "" }) => {

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

  const brands = await Brand.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const totalBrands = await Brand.countDocuments(filter);

  return {
    brands: brands,
    currentPage: page,
    totalPages: Math.ceil(totalBrands / limit),
    search
  };

};

const createBrand = async ({ body }) => {

  const validation = validateBrand(body);

  if (!validation.success) {
    return {
      success: false,
      errors: validation.errors
    };
  }

  const name = body.name.trim();

  const existingBrand = await Brand.findOne({
    name: {
      $regex: `^${name}$`,
      $options: "i"
    },
    isDeleted: false
  });

  if (existingBrand) {
    return {
      success: false,
      message: "Brand already exists"
    };
  }

  const brand = new Brand({
    name,
    slug: slugify(name, {
      lower: true,
      strict: true
    }),
    description: body.description?.trim()
  });

  await brand.save();

  return {
    success: true,
    message: "Brand added successfully"
  };

};

const getBrandById = async (id) => {

  return await Brand.findById(id);

};

const updateBrand = async ({ id, body }) => {

  const validation = validateBrand(body);

  if (!validation.success) {
    return {
      success: false,
      errors: validation.errors
    };
  }

  const name = body.name.trim();

  const existingBrand = await Brand.findOne({
    _id: { $ne: id },
    name: {
      $regex: `^${name}$`,
      $options: "i"
    },
    isDeleted: false
  });

  if (existingBrand) {
    return {
      success: false,
      message: "Brand already exists"
    };
  }

  await Brand.findByIdAndUpdate(id, {

    name,

    slug: slugify(name, {
      lower: true,
      strict: true
    }),

    description: body.description

  });

  return {
    success: true,
    message: "Brand updated successfully"
  };

};

const toggleBrandStatus = async (id) => {

  const brand = await Brand.findById(id);

  if (!brand) {
    return {
      success: false,
      message: "Brand not found"
    };
  }

  brand.isListed = !brand.isListed;

  await brand.save();

  return {
    success: true,
    message: brand.isListed
      ? "Brand listed"
      : "Brand unlisted"
  };

};

const deleteBrand = async (id) => {

  const brand = await Brand.findById(id);

  if (!brand) {
    return {
      success: false,
      message: "Brand not found"
    };
  }

  brand.isDeleted = true;

  await brand.save();

  return {
    success: true,
    message: "Brand deleted successfully"
  };

};

export {
  getBrands,
  createBrand,
  getBrandById,
  updateBrand,
  toggleBrandStatus,
  deleteBrand
};
