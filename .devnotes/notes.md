# Notes

## Sessions List: Load More
Sessions list starts with 20 elements loaded, and it has a lot more functionality triggered by scrolling down To the bottom of the list. 

Memory optimization: the browser VM should only keep in memory data related to the currently displayed browser sessions. OR: we make sure that the list doesn't require all the session data to be loaded into memory, but only the "gist" that's required for displaying the list items. Then, the entirety of the session data would be loaded into memory only When a specific section is selected to be displayed in the session breakdown.

## Svelte / React port?