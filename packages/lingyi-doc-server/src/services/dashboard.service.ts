import { Injectable } from '@nestjs/common';
import { DocumentRepository } from '../repositories/document.repository';
import { UserRepository } from '../repositories/user.repository';
import { StorageService } from './storage.service';

export interface DashboardTrendPoint {
  date: string;
  users: number;
  activeUsers: number;
  documents: number;
  storageBytes: number;
}

function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function endOfDay(date: Date): Date {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

function lastNDays(n: number): Date[] {
  const days: Date[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    days.push(d);
  }
  return days;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly documentRepository: DocumentRepository,
    private readonly storageService: StorageService,
  ) {}

  async getTrends(days = 7): Promise<DashboardTrendPoint[]> {
    const safeDays = Math.min(30, Math.max(1, days));
    const dayList = lastNDays(safeDays);
    if (!this.storageService.isReady() || dayList.length === 0) {
      return dayList.map((day) => ({
        date: formatDateKey(day),
        users: 0,
        activeUsers: 0,
        documents: 0,
        storageBytes: 0,
      }));
    }

    const rangeStart = dayList[0];
    const rangeEnd = endOfDay(dayList[dayList.length - 1]);

    // 固定次数查询：末日快照 + 区间日增量，再回推每日 as-of，避免 O(days) 次全表聚合
    const [
      activeMap,
      finalUsers,
      finalDocs,
      finalStorage,
      usersCreatedByDay,
      docDeltas,
    ] = await Promise.all([
      this.userRepository.countDailyActiveConsumers(rangeStart, rangeEnd),
      this.userRepository.countConsumersCreatedBefore(rangeEnd),
      this.documentRepository.countExistingAsOf(rangeEnd),
      this.documentRepository.sumStorageAsOf(rangeEnd),
      this.userRepository.countConsumersCreatedByDay(rangeStart, rangeEnd),
      this.documentRepository.getDailyExistenceDeltas(rangeStart, rangeEnd),
    ]);

    const results: DashboardTrendPoint[] = new Array(dayList.length);
    let users = finalUsers;
    let documents = finalDocs;
    let storageBytes = finalStorage;

    for (let i = dayList.length - 1; i >= 0; i -= 1) {
      const date = formatDateKey(dayList[i]);
      results[i] = {
        date,
        users,
        activeUsers: activeMap.get(date) ?? 0,
        documents,
        storageBytes,
      };

      if (i === 0) continue;
      users -= usersCreatedByDay.get(date) ?? 0;
      const created = docDeltas.created.get(date) ?? { count: 0, storage: 0 };
      const deleted = docDeltas.deleted.get(date) ?? { count: 0, storage: 0 };
      documents = documents - created.count + deleted.count;
      storageBytes = storageBytes - created.storage + deleted.storage;
    }

    return results;
  }
}
