export const formatErrorValidation = (error: any) => {
  return error.details.map((d: any) => d.message).join(", "); 
}