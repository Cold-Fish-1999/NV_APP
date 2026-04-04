import { z } from 'zod';

/** 单时段结构：清晨/上午/中午/晚上/深夜 */
declare const timeSlotSchema: z.ZodObject<{
    symptoms: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    feelings: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    behaviors: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    notes: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    symptoms: string[];
    feelings: string[];
    behaviors: string[];
    notes: string;
}, {
    symptoms?: string[] | undefined;
    feelings?: string[] | undefined;
    behaviors?: string[] | undefined;
    notes?: string | undefined;
}>;
type TimeSlot = z.infer<typeof timeSlotSchema>;
declare const timeSlotKeys: readonly ["earlyMorning", "morning", "noon", "evening", "lateNight"];
type TimeSlotKey = (typeof timeSlotKeys)[number];
/** 五个时间段的 structuredContent */
declare const structuredContentSchema: z.ZodObject<{
    earlyMorning: z.ZodObject<{
        symptoms: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        feelings: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        behaviors: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        notes: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        symptoms: string[];
        feelings: string[];
        behaviors: string[];
        notes: string;
    }, {
        symptoms?: string[] | undefined;
        feelings?: string[] | undefined;
        behaviors?: string[] | undefined;
        notes?: string | undefined;
    }>;
    morning: z.ZodObject<{
        symptoms: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        feelings: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        behaviors: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        notes: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        symptoms: string[];
        feelings: string[];
        behaviors: string[];
        notes: string;
    }, {
        symptoms?: string[] | undefined;
        feelings?: string[] | undefined;
        behaviors?: string[] | undefined;
        notes?: string | undefined;
    }>;
    noon: z.ZodObject<{
        symptoms: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        feelings: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        behaviors: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        notes: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        symptoms: string[];
        feelings: string[];
        behaviors: string[];
        notes: string;
    }, {
        symptoms?: string[] | undefined;
        feelings?: string[] | undefined;
        behaviors?: string[] | undefined;
        notes?: string | undefined;
    }>;
    evening: z.ZodObject<{
        symptoms: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        feelings: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        behaviors: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        notes: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        symptoms: string[];
        feelings: string[];
        behaviors: string[];
        notes: string;
    }, {
        symptoms?: string[] | undefined;
        feelings?: string[] | undefined;
        behaviors?: string[] | undefined;
        notes?: string | undefined;
    }>;
    lateNight: z.ZodObject<{
        symptoms: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        feelings: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        behaviors: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        notes: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        symptoms: string[];
        feelings: string[];
        behaviors: string[];
        notes: string;
    }, {
        symptoms?: string[] | undefined;
        feelings?: string[] | undefined;
        behaviors?: string[] | undefined;
        notes?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    earlyMorning: {
        symptoms: string[];
        feelings: string[];
        behaviors: string[];
        notes: string;
    };
    morning: {
        symptoms: string[];
        feelings: string[];
        behaviors: string[];
        notes: string;
    };
    noon: {
        symptoms: string[];
        feelings: string[];
        behaviors: string[];
        notes: string;
    };
    evening: {
        symptoms: string[];
        feelings: string[];
        behaviors: string[];
        notes: string;
    };
    lateNight: {
        symptoms: string[];
        feelings: string[];
        behaviors: string[];
        notes: string;
    };
}, {
    earlyMorning: {
        symptoms?: string[] | undefined;
        feelings?: string[] | undefined;
        behaviors?: string[] | undefined;
        notes?: string | undefined;
    };
    morning: {
        symptoms?: string[] | undefined;
        feelings?: string[] | undefined;
        behaviors?: string[] | undefined;
        notes?: string | undefined;
    };
    noon: {
        symptoms?: string[] | undefined;
        feelings?: string[] | undefined;
        behaviors?: string[] | undefined;
        notes?: string | undefined;
    };
    evening: {
        symptoms?: string[] | undefined;
        feelings?: string[] | undefined;
        behaviors?: string[] | undefined;
        notes?: string | undefined;
    };
    lateNight: {
        symptoms?: string[] | undefined;
        feelings?: string[] | undefined;
        behaviors?: string[] | undefined;
        notes?: string | undefined;
    };
}>;
type StructuredContent = z.infer<typeof structuredContentSchema>;
/** DailyLog 完整 schema */
declare const dailyLogSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    userId: z.ZodString;
    date: z.ZodString;
    rawInput: z.ZodString;
    structuredContent: z.ZodObject<{
        earlyMorning: z.ZodObject<{
            symptoms: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            feelings: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            behaviors: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            notes: z.ZodDefault<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            symptoms: string[];
            feelings: string[];
            behaviors: string[];
            notes: string;
        }, {
            symptoms?: string[] | undefined;
            feelings?: string[] | undefined;
            behaviors?: string[] | undefined;
            notes?: string | undefined;
        }>;
        morning: z.ZodObject<{
            symptoms: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            feelings: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            behaviors: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            notes: z.ZodDefault<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            symptoms: string[];
            feelings: string[];
            behaviors: string[];
            notes: string;
        }, {
            symptoms?: string[] | undefined;
            feelings?: string[] | undefined;
            behaviors?: string[] | undefined;
            notes?: string | undefined;
        }>;
        noon: z.ZodObject<{
            symptoms: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            feelings: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            behaviors: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            notes: z.ZodDefault<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            symptoms: string[];
            feelings: string[];
            behaviors: string[];
            notes: string;
        }, {
            symptoms?: string[] | undefined;
            feelings?: string[] | undefined;
            behaviors?: string[] | undefined;
            notes?: string | undefined;
        }>;
        evening: z.ZodObject<{
            symptoms: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            feelings: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            behaviors: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            notes: z.ZodDefault<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            symptoms: string[];
            feelings: string[];
            behaviors: string[];
            notes: string;
        }, {
            symptoms?: string[] | undefined;
            feelings?: string[] | undefined;
            behaviors?: string[] | undefined;
            notes?: string | undefined;
        }>;
        lateNight: z.ZodObject<{
            symptoms: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            feelings: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            behaviors: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            notes: z.ZodDefault<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            symptoms: string[];
            feelings: string[];
            behaviors: string[];
            notes: string;
        }, {
            symptoms?: string[] | undefined;
            feelings?: string[] | undefined;
            behaviors?: string[] | undefined;
            notes?: string | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        earlyMorning: {
            symptoms: string[];
            feelings: string[];
            behaviors: string[];
            notes: string;
        };
        morning: {
            symptoms: string[];
            feelings: string[];
            behaviors: string[];
            notes: string;
        };
        noon: {
            symptoms: string[];
            feelings: string[];
            behaviors: string[];
            notes: string;
        };
        evening: {
            symptoms: string[];
            feelings: string[];
            behaviors: string[];
            notes: string;
        };
        lateNight: {
            symptoms: string[];
            feelings: string[];
            behaviors: string[];
            notes: string;
        };
    }, {
        earlyMorning: {
            symptoms?: string[] | undefined;
            feelings?: string[] | undefined;
            behaviors?: string[] | undefined;
            notes?: string | undefined;
        };
        morning: {
            symptoms?: string[] | undefined;
            feelings?: string[] | undefined;
            behaviors?: string[] | undefined;
            notes?: string | undefined;
        };
        noon: {
            symptoms?: string[] | undefined;
            feelings?: string[] | undefined;
            behaviors?: string[] | undefined;
            notes?: string | undefined;
        };
        evening: {
            symptoms?: string[] | undefined;
            feelings?: string[] | undefined;
            behaviors?: string[] | undefined;
            notes?: string | undefined;
        };
        lateNight: {
            symptoms?: string[] | undefined;
            feelings?: string[] | undefined;
            behaviors?: string[] | undefined;
            notes?: string | undefined;
        };
    }>;
    createdAt: z.ZodOptional<z.ZodString>;
    updatedAt: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    userId: string;
    date: string;
    rawInput: string;
    structuredContent: {
        earlyMorning: {
            symptoms: string[];
            feelings: string[];
            behaviors: string[];
            notes: string;
        };
        morning: {
            symptoms: string[];
            feelings: string[];
            behaviors: string[];
            notes: string;
        };
        noon: {
            symptoms: string[];
            feelings: string[];
            behaviors: string[];
            notes: string;
        };
        evening: {
            symptoms: string[];
            feelings: string[];
            behaviors: string[];
            notes: string;
        };
        lateNight: {
            symptoms: string[];
            feelings: string[];
            behaviors: string[];
            notes: string;
        };
    };
    id?: string | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
}, {
    userId: string;
    date: string;
    rawInput: string;
    structuredContent: {
        earlyMorning: {
            symptoms?: string[] | undefined;
            feelings?: string[] | undefined;
            behaviors?: string[] | undefined;
            notes?: string | undefined;
        };
        morning: {
            symptoms?: string[] | undefined;
            feelings?: string[] | undefined;
            behaviors?: string[] | undefined;
            notes?: string | undefined;
        };
        noon: {
            symptoms?: string[] | undefined;
            feelings?: string[] | undefined;
            behaviors?: string[] | undefined;
            notes?: string | undefined;
        };
        evening: {
            symptoms?: string[] | undefined;
            feelings?: string[] | undefined;
            behaviors?: string[] | undefined;
            notes?: string | undefined;
        };
        lateNight: {
            symptoms?: string[] | undefined;
            feelings?: string[] | undefined;
            behaviors?: string[] | undefined;
            notes?: string | undefined;
        };
    };
    id?: string | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
}>;
type DailyLog = z.infer<typeof dailyLogSchema>;
/** 创建 DailyLog 时不需要 id/createdAt/updatedAt */
declare const createDailyLogSchema: z.ZodObject<Omit<{
    id: z.ZodOptional<z.ZodString>;
    userId: z.ZodString;
    date: z.ZodString;
    rawInput: z.ZodString;
    structuredContent: z.ZodObject<{
        earlyMorning: z.ZodObject<{
            symptoms: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            feelings: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            behaviors: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            notes: z.ZodDefault<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            symptoms: string[];
            feelings: string[];
            behaviors: string[];
            notes: string;
        }, {
            symptoms?: string[] | undefined;
            feelings?: string[] | undefined;
            behaviors?: string[] | undefined;
            notes?: string | undefined;
        }>;
        morning: z.ZodObject<{
            symptoms: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            feelings: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            behaviors: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            notes: z.ZodDefault<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            symptoms: string[];
            feelings: string[];
            behaviors: string[];
            notes: string;
        }, {
            symptoms?: string[] | undefined;
            feelings?: string[] | undefined;
            behaviors?: string[] | undefined;
            notes?: string | undefined;
        }>;
        noon: z.ZodObject<{
            symptoms: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            feelings: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            behaviors: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            notes: z.ZodDefault<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            symptoms: string[];
            feelings: string[];
            behaviors: string[];
            notes: string;
        }, {
            symptoms?: string[] | undefined;
            feelings?: string[] | undefined;
            behaviors?: string[] | undefined;
            notes?: string | undefined;
        }>;
        evening: z.ZodObject<{
            symptoms: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            feelings: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            behaviors: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            notes: z.ZodDefault<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            symptoms: string[];
            feelings: string[];
            behaviors: string[];
            notes: string;
        }, {
            symptoms?: string[] | undefined;
            feelings?: string[] | undefined;
            behaviors?: string[] | undefined;
            notes?: string | undefined;
        }>;
        lateNight: z.ZodObject<{
            symptoms: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            feelings: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            behaviors: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            notes: z.ZodDefault<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            symptoms: string[];
            feelings: string[];
            behaviors: string[];
            notes: string;
        }, {
            symptoms?: string[] | undefined;
            feelings?: string[] | undefined;
            behaviors?: string[] | undefined;
            notes?: string | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        earlyMorning: {
            symptoms: string[];
            feelings: string[];
            behaviors: string[];
            notes: string;
        };
        morning: {
            symptoms: string[];
            feelings: string[];
            behaviors: string[];
            notes: string;
        };
        noon: {
            symptoms: string[];
            feelings: string[];
            behaviors: string[];
            notes: string;
        };
        evening: {
            symptoms: string[];
            feelings: string[];
            behaviors: string[];
            notes: string;
        };
        lateNight: {
            symptoms: string[];
            feelings: string[];
            behaviors: string[];
            notes: string;
        };
    }, {
        earlyMorning: {
            symptoms?: string[] | undefined;
            feelings?: string[] | undefined;
            behaviors?: string[] | undefined;
            notes?: string | undefined;
        };
        morning: {
            symptoms?: string[] | undefined;
            feelings?: string[] | undefined;
            behaviors?: string[] | undefined;
            notes?: string | undefined;
        };
        noon: {
            symptoms?: string[] | undefined;
            feelings?: string[] | undefined;
            behaviors?: string[] | undefined;
            notes?: string | undefined;
        };
        evening: {
            symptoms?: string[] | undefined;
            feelings?: string[] | undefined;
            behaviors?: string[] | undefined;
            notes?: string | undefined;
        };
        lateNight: {
            symptoms?: string[] | undefined;
            feelings?: string[] | undefined;
            behaviors?: string[] | undefined;
            notes?: string | undefined;
        };
    }>;
    createdAt: z.ZodOptional<z.ZodString>;
    updatedAt: z.ZodOptional<z.ZodString>;
}, "id" | "createdAt" | "updatedAt">, "strip", z.ZodTypeAny, {
    userId: string;
    date: string;
    rawInput: string;
    structuredContent: {
        earlyMorning: {
            symptoms: string[];
            feelings: string[];
            behaviors: string[];
            notes: string;
        };
        morning: {
            symptoms: string[];
            feelings: string[];
            behaviors: string[];
            notes: string;
        };
        noon: {
            symptoms: string[];
            feelings: string[];
            behaviors: string[];
            notes: string;
        };
        evening: {
            symptoms: string[];
            feelings: string[];
            behaviors: string[];
            notes: string;
        };
        lateNight: {
            symptoms: string[];
            feelings: string[];
            behaviors: string[];
            notes: string;
        };
    };
}, {
    userId: string;
    date: string;
    rawInput: string;
    structuredContent: {
        earlyMorning: {
            symptoms?: string[] | undefined;
            feelings?: string[] | undefined;
            behaviors?: string[] | undefined;
            notes?: string | undefined;
        };
        morning: {
            symptoms?: string[] | undefined;
            feelings?: string[] | undefined;
            behaviors?: string[] | undefined;
            notes?: string | undefined;
        };
        noon: {
            symptoms?: string[] | undefined;
            feelings?: string[] | undefined;
            behaviors?: string[] | undefined;
            notes?: string | undefined;
        };
        evening: {
            symptoms?: string[] | undefined;
            feelings?: string[] | undefined;
            behaviors?: string[] | undefined;
            notes?: string | undefined;
        };
        lateNight: {
            symptoms?: string[] | undefined;
            feelings?: string[] | undefined;
            behaviors?: string[] | undefined;
            notes?: string | undefined;
        };
    };
}>;
type CreateDailyLog = z.infer<typeof createDailyLogSchema>;

export { type CreateDailyLog, type DailyLog, type StructuredContent, type TimeSlot, type TimeSlotKey, createDailyLogSchema, dailyLogSchema, structuredContentSchema, timeSlotKeys, timeSlotSchema };
