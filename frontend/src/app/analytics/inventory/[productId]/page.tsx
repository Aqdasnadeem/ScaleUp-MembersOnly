import InventoryProductDetails from "@/components/InventoryProductDetails";

export default async function InventoryProductPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  return <InventoryProductDetails key={productId} productId={productId} />;
}
