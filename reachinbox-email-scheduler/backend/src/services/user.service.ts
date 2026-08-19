import { userRepository } from '../repositories/user.repository.js';
import { senderRepository } from '../repositories/sender.repository.js';
import { campaignRepository } from '../repositories/campaign.repository.js';
import { ApiError } from '../utils/apiError.js';

export const userService = {
  async getUserById(id: string) {
    const user = await userRepository.findById(id);
    if (!user) {
      throw ApiError.notFound('User not found');
    }
    return user;
  },

  async getUserSenders(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw ApiError.notFound('User not found');
    }
    return senderRepository.findByUserId(userId);
  },

  async getUserCampaigns(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw ApiError.notFound('User not found');
    }
    return campaignRepository.findByUserId(userId);
  },
};
