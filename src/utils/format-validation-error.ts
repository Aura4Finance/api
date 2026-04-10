export const formatErrorValidation = (error: any) => {
  if (!error || !error.details || error.details.length === 0) {
    return 'Validation failed. Please check your input.';
  }
  
  return error.details
    .map((d: any) => {
      // Use custom message if available, otherwise fallback to field name and error type
      return d.message || `${d.path.join('.')}: ${d.type}`;
    })
    .join('; ');
}