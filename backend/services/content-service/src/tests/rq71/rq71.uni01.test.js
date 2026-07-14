const fs = require('fs');
const path = require('path');

describe('TC-71-UNI-01 - Ausencia de endpoint de recomendación en chat', () => {
  test('No se identifica método específico para recomendar recursos en chat', () => {
    const controllersPath = path.join(__dirname, '../../controllers');

    const controllerFiles = [
      'categoryController.js',
      'favoriteController.js',
      'ratingController.js',
      'repositoryController.js',
      'resourceController.js',
      'statsController.js',
    ];

    const forbiddenPatterns = [
      /recommendResource/i,
      /recommend.*chat/i,
      /chat.*recommend/i,
      /recomendar.*chat/i,
      /chat.*recomendar/i,
      /recurso recomendado/i,
      /chat\/recommend/i,
    ];

    const matches = [];

    controllerFiles.forEach((file) => {
      const filePath = path.join(controllersPath, file);
      const content = fs.readFileSync(filePath, 'utf8');

      forbiddenPatterns.forEach((pattern) => {
        if (pattern.test(content)) {
          matches.push({
            file,
            pattern: pattern.toString(),
          });
        }
      });
    });

    expect(matches).toEqual([]);
  });
});
