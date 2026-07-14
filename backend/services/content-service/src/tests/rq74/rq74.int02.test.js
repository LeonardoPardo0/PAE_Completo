const ResourceController = require('../../controllers/resourceController');
const RepositoryController = require('../../controllers/repositoryController');

jest.mock('fs', () => ({
  promises: {
    access: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('../../config/env', () => ({
  UPLOAD_PATH: 'C:/fake/uploads',
}));

jest.mock('../../models', () => ({
  Resource: {
    findOne: jest.fn(),
  },
  Repository: {
    findAll: jest.fn(),
  },
  Category: {},
  Tag: {},
  Rating: {},
}));

const { Resource, Repository } = require('../../models');

describe('TC-74-INT-02 - Actualizar ranking por nuevas descargas', () => {
  let reqDownload;
  let reqPopular;
  let res;
  let next;

  beforeEach(() => {
    reqDownload = {
      params: {
        id: 10,
      },
    };

    reqPopular = {
      query: {
        limit: 10,
        orderBy: 'cantidad_descargas',
      },
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      sendFile: jest.fn(),
    };

    next = jest.fn();

    jest.clearAllMocks();
  });

  test('Cada descarga incrementa descargas del recurso y cantidad_descargas del repositorio', async () => {
    const repositorioMock = {
      id_repositorio: 5,
      titulo: 'Repositorio Popular',
      cantidad_descargas: 7,
      increment: jest.fn().mockResolvedValue(true),
    };

    const recursoMock = {
      id_recurso: 10,
      id_repositorio: 5,
      titulo: 'Material de prueba',
      activo: true,
      url_archivo: '/uploads/resources/pdfs/material.pdf',
      url_externa: null,
      extension: '.pdf',
      increment: jest.fn().mockResolvedValue(true),
      repositorio: repositorioMock,
    };

    Resource.findOne.mockResolvedValue(recursoMock);

    await ResourceController.download(reqDownload, res, next);

    expect(Resource.findOne).toHaveBeenCalled();
    expect(recursoMock.increment).toHaveBeenCalledWith('descargas');
    expect(repositorioMock.increment).toHaveBeenCalledWith('cantidad_descargas');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      type: 'file',
      downloadUrl: '/content/resources/10/file',
      filename: 'Material de prueba.pdf',
    });

    const rankingMock = [
      {
        id_repositorio: 5,
        titulo: 'Repositorio Popular',
        cantidad_descargas: 8,
      },
      {
        id_repositorio: 8,
        titulo: 'Repositorio Menos Descargado',
        cantidad_descargas: 3,
      },
    ];

    Repository.findAll.mockResolvedValue(rankingMock);

    await RepositoryController.getPopular(reqPopular, res, next);

    expect(Repository.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { activo: true, publico: true },
        order: [['cantidad_descargas', 'DESC']],
        limit: 10,
      })
    );

    const popularResponse = res.json.mock.calls.find(
      call => call[0].data === rankingMock
    );

    expect(popularResponse[0]).toEqual({
      success: true,
      data: rankingMock,
    });
  });
});
