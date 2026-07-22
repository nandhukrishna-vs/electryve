const successResponse = (
  message,
  redirect,
  data = null
) => ({
  success: true,
  message,
  redirect,
  data
});

const errorResponse = (
  message,
  redirect,
  data = null
) => ({
  success: false,
  message,
  redirect,
  data
});

export {
  successResponse,
  errorResponse
};