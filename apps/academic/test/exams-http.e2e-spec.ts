import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { DatabaseService } from '../src/database/database.service';
import type { Exam } from '../src/exams/exam.types';

describe('Exams HTTP lifecycle', () => {
  let app: INestApplication<App>, db: DatabaseService;
  const account = randomUUID(),
    other = randomUUID(),
    token = randomBytes(32).toString('hex'),
    otherToken = randomBytes(32).toString('hex');
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    db = app.get(DatabaseService);
    await db.query(
      `INSERT INTO academic.accounts(id,name,token_hash) VALUES ($1,'Exams A',$2),($3,'Exams B',$4)`,
      [
        account,
        createHash('sha256').update(token).digest('hex'),
        other,
        createHash('sha256').update(otherToken).digest('hex'),
      ],
    );
  });
  afterAll(async () => {
    if (db) {
      await db.query('DELETE FROM academic.exams WHERE account_id IN ($1,$2)', [
        account,
        other,
      ]);
      await db.query('DELETE FROM academic.accounts WHERE id IN ($1,$2)', [
        account,
        other,
      ]);
    }
    await app?.close();
  });
  it('enforces auth, atomic date/weight changes, owner isolation, no-op updates and repeatable soft deletion', async () => {
    const http = app.getHttpServer();
    await request(http).get('/api/v1/exams').expect(401);
    const created = await request(http)
      .post('/api/v1/exams')
      .auth(token, { type: 'bearer' })
      .send({
        title: 'Parcial CC',
        course_name: 'Cloud Computing',
        course_abbreviation: 'CC',
        section: 'theory',
        topics: 'Temas 1 y 2',
        exam_date: '2026-11-25',
        grade: 0,
      })
      .expect(201);
    const exam = created.body as Exam;
    expect(exam.status).toBe('scheduled');
    expect(exam.grade).toBe(0);
    const path = `/api/v1/exams/${exam.id}`;
    await request(http)
      .get(path)
      .auth(otherToken, { type: 'bearer' })
      .expect(404);
    await request(http)
      .patch(path)
      .auth(token, { type: 'bearer' })
      .send({})
      .expect(422);
    await request(http)
      .patch(path)
      .auth(token, { type: 'bearer' })
      .send({ exam_at: '2026-11-25T10:00:00+01:00' })
      .expect(422);
    await request(http)
      .patch(path)
      .auth(token, { type: 'bearer' })
      .send({ weight_percent: 20 })
      .expect(422);
    const unchanged = await request(http)
      .patch(path)
      .auth(token, { type: 'bearer' })
      .send({ title: exam.title })
      .expect(200);
    expect((unchanged.body as Exam).updated_at).toBe(exam.updated_at);
    const updated = await request(http)
      .patch(path)
      .auth(token, { type: 'bearer' })
      .send({
        exam_date: null,
        exam_at: '2026-11-25T10:00:00+01:00',
        status: 'cancelled',
        weight_percent: 20,
        weight_basis: 'course',
      })
      .expect(200);
    expect(updated.body as Exam).toMatchObject({
      exam_date: null,
      exam_at: '2026-11-25T09:00:00.000Z',
      status: 'cancelled',
    });
    await request(http)
      .delete(path)
      .auth(token, { type: 'bearer' })
      .expect(204);
    const first = await db.query<{ deleted_at: Date }>(
      'SELECT deleted_at FROM academic.exams WHERE id=$1',
      [exam.id],
    );
    await request(http)
      .delete(path)
      .auth(token, { type: 'bearer' })
      .expect(204);
    const exported = await request(http)
      .get('/api/v1/exams/export')
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(exported.body as Exam[]).toHaveLength(1);
    expect((exported.body as { deleted_at: string }[])[0].deleted_at).toBe(
      first.rows[0].deleted_at.toISOString(),
    );
    await request(http).get(path).auth(token, { type: 'bearer' }).expect(404);
    const list = await request(http)
      .get('/api/v1/exams')
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(list.body as Exam[]).toEqual([]);
  });
});
