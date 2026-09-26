/**
 * Счётчик частоты по ключу в памяти процесса (решение Р-241).
 *
 * Прежде счётчик приёма заявок имел три изъяна. Отклонённые попытки
 * считались наравне с принятыми: тот, кто продолжал нажимать «Отправить»,
 * сам продлевал себе запрет, а сообщение обещало «подождите минуту» при
 * окне в пять. При пяти тысячах адресов карта очищалась целиком: робот,
 * перебирающий адреса, обнулял запрет всем, в том числе себе. Теперь
 * отказ окно не продлевает, а при переполнении уходят сначала ключи без
 * попыток в окне, затем самые давние.
 */
export class RateLimiter {
  readonly #windowMs: number;
  readonly #limit: number;
  readonly #maxKeys: number;
  readonly #hits = new Map<string, number[]>();

  constructor(options: { windowMs: number; limit: number; maxKeys: number }) {
    this.#windowMs = options.windowMs;
    this.#limit = options.limit;
    this.#maxKeys = options.maxKeys;
  }

  /** Отметить попытку. `true` — попытка отклонена и не засчитана. */
  hit(key: string, now: number = Date.now()): boolean {
    const recent = (this.#hits.get(key) ?? []).filter((t) => now - t < this.#windowMs);
    if (recent.length >= this.#limit) {
      this.#hits.set(key, recent);
      return true;
    }
    recent.push(now);
    // Удаление и вставка переносят ключ в конец порядка обхода: давними
    // становятся те, кто дольше не приходил.
    this.#hits.delete(key);
    this.#hits.set(key, recent);
    this.#evict(now);
    return false;
  }

  get size(): number {
    return this.#hits.size;
  }

  #evict(now: number): void {
    if (this.#hits.size <= this.#maxKeys) return;
    for (const [key, times] of this.#hits) {
      if (times.every((t) => now - t >= this.#windowMs)) this.#hits.delete(key);
    }
    for (const key of this.#hits.keys()) {
      if (this.#hits.size <= this.#maxKeys) break;
      this.#hits.delete(key);
    }
  }
}
