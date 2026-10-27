// Synthetic capabilities only. Never capture real purchase links in test artifacts.
export const accessUrl =
  "https://api.example.test/public/commerce/orders/DEMO/items/42/training?accessToken=synthetic%2Btoken&lang=fr";
export const playerUrl =
  "https://api.example.test/public/commerce/training-player/orders/DEMO/items/42?accessToken=synthetic%2Btoken&lang=fr";
export const materialId = "11111111-1111-4111-8111-111111111111";
export const moduleId = "22222222-2222-4222-8222-222222222222";
export const purchase = {
  productId: 7,
  title: "Demo training",
  orderReference: "DEMO",
  orderItemId: 42,
  trainingAccessUrl: accessUrl,
  trainingPlayerUrl: playerUrl,
  selectionToken: "synthetic-selection-secret",
};
export const curriculum = {
  productId: 7,
  title: "Demo training",
  version: 3,
  totalMaterials: 1,
  completedMaterials: 0,
  progressPercentage: 0,
  nextMaterialId: materialId,
  modules: [
    {
      id: moduleId,
      title: "First module",
      description: "",
      published: true,
      position: 9,
      materials: [
        {
          id: materialId,
          title: "Lesson",
          type: "LINK",
          description: "Private learner notes",
          published: true,
          position: 4,
          completed: false,
          linkProvider: "YOUTUBE",
          linkUrl: "https://youtube.com/watch?v=synthetic",
          assetKey: "commerce-training-assets/private",
          fileName: "private-name",
        },
      ],
    },
  ],
};
