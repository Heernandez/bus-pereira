import AsyncStorage from '@react-native-async-storage/async-storage';
import { createCampaignHistory } from './campaignHistory';

export const campaignHistory = createCampaignHistory(AsyncStorage);
