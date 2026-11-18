import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MermasService } from './mermas.service';
import { Merma } from '../entities/merma.entity';

describe('MermasService.findAll', () => {
  let service: MermasService;
  const repo = { find: jest.fn(), findAndCount: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MermasService,
        { provide: getRepositoryToken(Merma), useValue: repo },
        { provide: DataSource, useValue: {} },
      ],
    }).compile();
    service = module.get(MermasService);
  });

  it('sin page/limit devuelve la lista completa del negocio, la más reciente primero', async () => {
    repo.find.mockResolvedValue([{ id: 'm1' }]);
    const result = await service.findAll('t1');
    expect(result).toEqual([{ id: 'm1' }]);
    expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenant_id: 't1' },
      order: { created_at: 'DESC' },
    }));
    expect(repo.findAndCount).not.toHaveBeenCalled();
  });

  it('con page/limit devuelve solo esa página y el total', async () => {
    repo.findAndCount.mockResolvedValue([[{ id: 'm9' }], 17]);
    const result = await service.findAll('t1', { page: 2, limit: 8 });
    expect(result).toEqual({ data: [{ id: 'm9' }], total: 17, page: 2, limit: 8 });
    expect(repo.findAndCount).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenant_id: 't1' },
      skip: 8,
      take: 8,
    }));
  });
});
