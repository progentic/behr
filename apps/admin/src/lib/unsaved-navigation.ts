export function confirmEditorNavigation(dirty: boolean): boolean {
  return !dirty || window.confirm("Discard unsaved changes to this page?");
}
