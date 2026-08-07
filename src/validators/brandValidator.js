const validateBrand = ({ name, description }) => {

  const errors = {};

  name = name?.trim();
  description = description?.trim();

  if (!name) {
    errors.name = "Brand name is required";
  } else if (name.length < 3) {
    errors.name = "Brand name must be at least 3 characters";
  } else if (name.length > 50) {
    errors.name = "Brand name cannot exceed 50 characters";
  }

  if (description && description.length > 200) {
    errors.description = "Description cannot exceed 200 characters";
  }

  return {
    success: Object.keys(errors).length === 0,
    errors
  };
};

export {
  validateBrand
};