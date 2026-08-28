type EbayDraftExportButtonProps = {
  itemId: string;
};

export default function EbayDraftExportButton({
  itemId,
}: EbayDraftExportButtonProps) {
  return (
    <a
      href={`/app/inventory/${itemId}/ebay-draft`}
      className="app-button mt-2 w-full justify-center"
    >
      Export eBay Draft CSV
    </a>
  );
}
