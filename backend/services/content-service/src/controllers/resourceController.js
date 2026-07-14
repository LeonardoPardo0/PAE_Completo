const { Resource, Repository } = require('../models');
const path = require('path');
const fs = require('fs').promises;
const config = require('../config/env');

const resourceAttributes = Resource.rawAttributes || {};
const fileSizeField = Object.keys(resourceAttributes).find((key) => (
    key !== 'url_archivo' && key !== 'extension' && key.endsWith('_archivo')
));

class ResourceController {
    static async _findDownloadableResource(id) {
        return Resource.findOne({
            where: { id_recurso: id, activo: true },
            include: [{
                model: Repository,
                as: 'repositorio',
                where: { activo: true, publico: true },
            }],
        });
    }

    static _getLocalFilePath(resource) {
        if (!resource.url_archivo) {
            return null;
        }

        const relativePath = resource.url_archivo.replace(/^\/?uploads\//, '');
        const uploadRoot = path.resolve(config.UPLOAD_PATH);
        const filePath = path.resolve(uploadRoot, relativePath);

        if (!filePath.startsWith(uploadRoot)) {
            return null;
        }

        return filePath;
    }

    static _applyUploadedFile(resourceData, file) {
        resourceData.url_archivo = `/uploads/resources/${ResourceController._getSubfolder(file.mimetype)}/${file.filename}`;
        resourceData.extension = path.extname(file.originalname);

        if (fileSizeField) {
            resourceData[fileSizeField] = file.size;
        }
    }

    /**
     * GET /api/content/resources
     * Listar recursos de un repositorio
     */
    static async list(req, res, next) {
        try {
            const { repositorio_id, tipo } = req.query;

            if (!repositorio_id) {
                return res.status(400).json({
                    success: false,
                    message: 'El ID del repositorio es requerido',
                });
            }

            const where = { id_repositorio: repositorio_id, activo: true };
            if (tipo) where.tipo_recurso = tipo;

            const resources = await Resource.findAll({
                where,
                order: [['orden', 'ASC'], ['fecha_subida', 'DESC']],
            });

            return res.status(200).json({
                success: true,
                data: resources,
            });
        } catch (error) {
            return next(error);
        }
    }

    /**
     * GET /api/content/resources/:id
     * Obtener recurso por ID
     */
    static async getById(req, res, next) {
        try {
            const { id } = req.params;

            const resource = await Resource.findOne({
                where: { id_recurso: id, activo: true },
                include: [{
                    model: Repository,
                    as: 'repositorio',
                    attributes: ['id_repositorio', 'titulo', 'id_profesor'],
                }],
            });

            if (!resource) {
                return res.status(404).json({
                    success: false,
                    message: 'Recurso no encontrado',
                });
            }

            return res.status(200).json({
                success: true,
                data: resource,
            });
        } catch (error) {
            return next(error);
        }
    }

    /**
     * POST /api/content/resources
     * Crear recurso (RQ14, RQ38)
     */
    static async create(req, res, next) {
        try {
            const userId = req.user.id;
            const {
                id_repositorio,
                titulo,
                descripcion,
                tipo_recurso,
                url_externa,
                orden,
            } = req.body;

            if (!id_repositorio || !titulo || !tipo_recurso) {
                return res.status(400).json({
                    success: false,
                    message: 'Campos requeridos: id_repositorio, titulo, tipo_recurso',
                });
            }

            const repository = await Repository.findOne({
                where: { id_repositorio, id_profesor: userId, activo: true },
            });

            if (!repository) {
                return res.status(404).json({
                    success: false,
                    message: 'Repositorio no encontrado o no tienes permisos',
                });
            }

            const resourceData = {
                id_repositorio,
                titulo: titulo.trim(),
                descripcion: descripcion?.trim() || null,
                tipo_recurso,
                orden: orden ? parseInt(orden, 10) : 0,
            };

            if (url_externa) {
                resourceData.url_externa = url_externa;
            }

            if (req.file) {
                ResourceController._applyUploadedFile(resourceData, req.file);
            } else if (!url_externa) {
                return res.status(400).json({
                    success: false,
                    message: 'Debes subir un archivo o proporcionar una URL externa',
                });
            }

            const resource = await Resource.create(resourceData);

            return res.status(201).json({
                success: true,
                message: 'Recurso creado exitosamente',
                data: resource,
            });
        } catch (error) {
            return next(error);
        }
    }

    /**
     * PUT /api/content/resources/:id
     * Actualizar recurso
     */
    static async update(req, res, next) {
        try {
            const { id } = req.params;
            const userId = req.user.id;
            const { titulo, descripcion, url_externa, orden } = req.body;

            const resource = await Resource.findOne({
                where: { id_recurso: id, activo: true },
                include: [{ model: Repository, as: 'repositorio' }],
            });

            if (!resource) {
                return res.status(404).json({
                    success: false,
                    message: 'Recurso no encontrado',
                });
            }

            if (String(resource.repositorio.id_profesor) !== String(userId)) {
                return res.status(403).json({
                    success: false,
                    message: 'No tienes permisos para editar este recurso',
                });
            }

            const updateData = {};
            if (titulo) updateData.titulo = titulo.trim();
            if (descripcion !== undefined) updateData.descripcion = descripcion?.trim() || null;
            if (url_externa !== undefined) updateData.url_externa = url_externa || null;
            if (orden !== undefined) updateData.orden = parseInt(orden, 10);

            if (req.file) {
                if (resource.url_archivo) {
                    const oldPath = ResourceController._getLocalFilePath(resource);
                    if (oldPath) {
                        try {
                            await fs.unlink(oldPath);
                        } catch (err) {
                            if (err.code !== 'ENOENT') {
                                console.error('Error eliminando archivo anterior:', err);
                            }
                        }
                    }
                }

                ResourceController._applyUploadedFile(updateData, req.file);
            }

            await resource.update(updateData);

            return res.status(200).json({
                success: true,
                message: 'Recurso actualizado exitosamente',
                data: resource,
            });
        } catch (error) {
            return next(error);
        }
    }

    /**
     * DELETE /api/content/resources/:id
     * Eliminar recurso (soft delete)
     */
    static async delete(req, res, next) {
        try {
            const { id } = req.params;
            const userId = req.user.id;

            const resource = await Resource.findOne({
                where: { id_recurso: id, activo: true },
                include: [{ model: Repository, as: 'repositorio' }],
            });

            if (!resource) {
                return res.status(404).json({
                    success: false,
                    message: 'Recurso no encontrado',
                });
            }

            if (String(resource.repositorio.id_profesor) !== String(userId)) {
                return res.status(403).json({
                    success: false,
                    message: 'No tienes permisos para eliminar este recurso',
                });
            }

            await resource.update({ activo: false });

            return res.status(200).json({
                success: true,
                message: 'Recurso eliminado exitosamente',
            });
        } catch (error) {
            return next(error);
        }
    }

    /**
     * POST /api/content/resources/:id/download
     * Registrar y preparar descarga (RQ43)
     */
    static async download(req, res, next) {
        try {
            const { id } = req.params;
            const resource = await ResourceController._findDownloadableResource(id);

            if (!resource) {
                return res.status(404).json({
                    success: false,
                    message: 'Recurso no encontrado',
                });
            }

            await resource.increment('descargas');
            await resource.repositorio.increment('cantidad_descargas');

            if (resource.url_externa) {
                return res.status(200).json({
                    success: true,
                    type: 'external',
                    url: resource.url_externa,
                    filename: resource.titulo,
                });
            }

            if (!resource.url_archivo) {
                return res.status(404).json({
                    success: false,
                    message: 'El recurso no tiene archivo asociado',
                });
            }

            const filePath = ResourceController._getLocalFilePath(resource);

            if (!filePath) {
                return res.status(400).json({
                    success: false,
                    message: 'Ruta de archivo invalida',
                });
            }

            try {
                await fs.access(filePath);
            } catch (error) {
                return res.status(404).json({
                    success: false,
                    message: 'Archivo no encontrado en el servidor',
                });
            }

            return res.status(200).json({
                success: true,
                type: 'file',
                downloadUrl: `/content/resources/${resource.id_recurso}/file`,
                filename: `${resource.titulo}${resource.extension || ''}`,
            });
        } catch (error) {
            return next(error);
        }
    }

    /**
     * GET /api/content/resources/:id/file
     * Enviar archivo local autenticado
     */
    static async streamFile(req, res, next) {
        try {
            const { id } = req.params;
            const resource = await ResourceController._findDownloadableResource(id);

            if (!resource || !resource.url_archivo) {
                return res.status(404).json({
                    success: false,
                    message: 'Archivo no encontrado',
                });
            }

            const filePath = ResourceController._getLocalFilePath(resource);

            if (!filePath) {
                return res.status(400).json({
                    success: false,
                    message: 'Ruta de archivo invalida',
                });
            }

            try {
                await fs.access(filePath);
            } catch (error) {
                return res.status(404).json({
                    success: false,
                    message: 'Archivo no encontrado en el servidor',
                });
            }

            const filename = `${resource.titulo}${resource.extension || ''}`.replace(/[^\w.\- ]+/g, '_');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

            return res.sendFile(filePath, (err) => {
                if (err) {
                    next(err);
                }
            });
        } catch (error) {
            return next(error);
        }
    }

    static _getSubfolder(mimetype) {
        if (mimetype.startsWith('application/pdf')) return 'pdfs';
        if (mimetype.startsWith('video/')) return 'videos';
        if (mimetype.startsWith('audio/')) return 'audios';
        if (mimetype.startsWith('image/')) return 'images';
        return 'others';
    }
}

module.exports = ResourceController;
