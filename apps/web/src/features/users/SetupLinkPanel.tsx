import { Button, Panel } from '../../components/ui';
import { useToast } from '../../components/toast';
import { he } from '../../i18n/he';

/**
 * The link only exists in this panel: the server stores a hash and cannot show it again. It stays
 * until the admin closes it, with a copy button because the next step is pasting it into a chat.
 */
export function SetupLinkPanel({
  link,
  onClose,
}: {
  link: { name: string; url: string; reset: boolean };
  onClose: () => void;
}) {
  const toast = useToast();

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(link.url);
      toast.success({ title: he.users.linkCopied });
    } catch {
      // Clipboard access can be refused (insecure context, permissions): the link is still selectable below.
    }
  }

  return (
    <Panel>
      <div className="space-y-2 px-4 py-3">
        <p className="font-semibold">{he.users.setupLinkTitle(link.name)}</p>
        <p className="text-meta text-oxide">{he.users.setupLinkOnce}</p>
        {link.reset && <p className="text-meta text-ink-soft">{he.users.setupLinkResetNote}</p>}
        <input
          readOnly
          value={link.url}
          dir="ltr"
          onFocus={(e) => e.currentTarget.select()}
          className="block w-full rounded-ctl border border-rule-strong bg-brass-wash px-3 py-2 text-meta"
        />
        <div className="flex gap-2 pt-1">
          <Button size="sm" onClick={() => void copy()}>
            {he.users.copyLink}
          </Button>
          <Button variant="quiet" size="sm" onClick={onClose}>
            {he.common.close}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
