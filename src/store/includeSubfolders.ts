export const INCLUDE_SUBFOLDERS_STORAGE_KEY = "image-crunch.includeSubfolders";

// Off unless a saved `true` is found
export function loadIncludeSubfolders(): boolean {
  try {
    const stored = localStorage.getItem(INCLUDE_SUBFOLDERS_STORAGE_KEY);
    return stored !== null && JSON.parse(stored) === true;
  } catch (error) {
    console.error("Failed to load the subfolder setting:", error);
    return false;
  }
}

export function saveIncludeSubfolders(include: boolean) {
  try {
    localStorage.setItem(
      INCLUDE_SUBFOLDERS_STORAGE_KEY,
      JSON.stringify(include),
    );
  } catch (error) {
    console.error("Failed to save the subfolder setting:", error);
  }
}
