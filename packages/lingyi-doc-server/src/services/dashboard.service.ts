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
    const activeMap = await this.userRepository.countDailyActiveConsumers(rangeStart, rangeEnd);

    return Promise.all(dayList.map(async (day) => {
      const date = formatDateKey(day);
      const end = endOfDay(day);
      const [users, documents, storageBytes] = await Promise.all([
        this.userRepository.countConsumersCreatedBefore(end),
        this.documentRepository.countExistingAsOf(end),
        this.documentRepository.sumStorageAsOf(end),
      ]);
      return {
        date,
        users,
        activeUsers: activeMap.get(date) ?? 0,
        documents,
        storageBytes,
      };
    }));
  }
}
