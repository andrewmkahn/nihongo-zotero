/**
 * styles.ts — Install custom CSL citation styles bundled with the plugin.
 *
 * Zotero.Styles.install() expects the CSL XML as a string, not a URL.
 * We use Zotero.File.getContentsFromURLAsync() to read the chrome:// content
 * first, then pass the string to install().
 */

export async function installStyles(): Promise<void> {
  const styleBase = "chrome://nihongo-zotero/content/styles/";
  const files = ["chicago-ja-roman.csl", "chicago-ja-roman-no-trans.csl", "chicago-ja-full.csl"];

  for (const file of files) {
    const url = styleBase + file;
    try {
      const content = await (Zotero.File as any).getContentsFromURLAsync(url);
      await (Zotero.Styles as any).install(content, url, true);
      Zotero.debug(`[NihongoZotero] Installed style: ${file}`);
    } catch (e) {
      Zotero.debug(`[NihongoZotero] Style install skipped (${file}): ${e}`);
    }
  }
}
