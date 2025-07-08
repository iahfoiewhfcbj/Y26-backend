import nodemailer from 'nodemailer';
import { logger } from './logger';

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export const sendEmail = async (options: EmailOptions): Promise<void> => {
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    logger.info(`Email sent successfully to ${options.to}`, { messageId: info.messageId });
  } catch (error) {
    logger.error('Failed to send email', { error, to: options.to });
    throw error;
  }
};

export const emailTemplates = {
  userWelcome: (name: string, email: string, tempPassword: string) => ({
    subject: 'Welcome to Yugam Finance Portal',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
        <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h2 style="color: #1e40af; margin-bottom: 20px;">Welcome to Yugam Finance Portal</h2>
          <p style="color: #374151; margin-bottom: 15px;">Dear ${name},</p>
          <p style="color: #374151; margin-bottom: 15px;">Your account has been created successfully for the Yugam Finance Portal. Here are your login credentials:</p>
          
          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 5px 0; color: #374151;"><strong>Email:</strong> ${email}</p>
            <p style="margin: 5px 0; color: #374151;"><strong>Password:</strong> ${tempPassword}</p>
          </div>
          
          <p style="color: #dc2626; margin-bottom: 15px;"><strong>Important:</strong> Please login and change your password immediately for security purposes.</p>
          
          <div style="margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/login" style="background-color: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Login to Portal</a>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
            Best regards,<br>
            Yugam Finance Team<br>
            Kumaraguru College of Technology
          </p>
        </div>
      </div>
    `,
  }),

  eventCreated: (eventTitle: string, creatorName: string, coordinatorName: string) => ({
    subject: `New ${eventTitle} Created - Coordinator Assignment`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
        <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h2 style="color: #059669; margin-bottom: 20px;">New Event/Workshop Created</h2>
          <p style="color: #374151; margin-bottom: 15px;">Dear ${coordinatorName},</p>
          <p style="color: #374151; margin-bottom: 15px;">You have been assigned as the coordinator for a new event/workshop:</p>
          
          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 5px 0; color: #374151;"><strong>Event/Workshop:</strong> ${eventTitle}</p>
            <p style="margin: 5px 0; color: #374151;"><strong>Created by:</strong> ${creatorName}</p>
          </div>
          
          <p style="color: #374151; margin-bottom: 15px;">Please login to the portal to view details and track the event progress.</p>
          
          <div style="margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/events" style="background-color: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Event</a>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
            Best regards,<br>
            Yugam Finance Team<br>
            Kumaraguru College of Technology
          </p>
        </div>
      </div>
    `,
  }),

  workshopCreated: (workshopTitle: string, creatorName: string, coordinatorName: string) => ({
    subject: `New Workshop Created - Coordinator Assignment: ${workshopTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
        <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h2 style="color: #059669; margin-bottom: 20px;">New Workshop Created</h2>
          <p style="color: #374151; margin-bottom: 15px;">Dear ${coordinatorName},</p>
          <p style="color: #374151; margin-bottom: 15px;">You have been assigned as the coordinator for a new workshop:</p>
          
          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 5px 0; color: #374151;"><strong>Workshop:</strong> ${workshopTitle}</p>
            <p style="margin: 5px 0; color: #374151;"><strong>Created by:</strong> ${creatorName}</p>
          </div>
          
          <p style="color: #374151; margin-bottom: 15px;">Please login to the portal to view details and track the workshop progress.</p>
          
          <div style="margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/workshops" style="background-color: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Workshop</a>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
            Best regards,<br>
            Yugam Finance Team<br>
            Kumaraguru College of Technology
          </p>
        </div>
      </div>
    `,
  }),

  workshopBudgetSubmitted: (workshopTitle: string, teamLeadName: string) => ({
    subject: `Workshop Budget Submitted for Review: ${workshopTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
        <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h2 style="color: #d97706; margin-bottom: 20px;">Workshop Budget Submitted for Review</h2>
          <p style="color: #374151; margin-bottom: 15px;">Dear Finance Team,</p>
          <p style="color: #374151; margin-bottom: 15px;">A workshop budget has been submitted for review:</p>
          
          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 5px 0; color: #374151;"><strong>Workshop:</strong> ${workshopTitle}</p>
            <p style="margin: 5px 0; color: #374151;"><strong>Submitted by:</strong> ${teamLeadName}</p>
          </div>
          
          <p style="color: #374151; margin-bottom: 15px;">Please login to the portal to review and approve the workshop budget.</p>
          
          <div style="margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/workshop-budgets" style="background-color: #d97706; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Review Budget</a>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
            Best regards,<br>
            Yugam Finance Portal<br>
            Kumaraguru College of Technology
          </p>
        </div>
      </div>
    `,
  }),

  workshopBudgetApproved: (workshopTitle: string, status: string, remarks: string) => ({
    subject: `Workshop Budget ${status}: ${workshopTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
        <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h2 style="color: ${status === 'APPROVED' ? '#059669' : '#dc2626'}; margin-bottom: 20px;">Workshop Budget ${status}</h2>
          <p style="color: #374151; margin-bottom: 15px;">Dear Team,</p>
          <p style="color: #374151; margin-bottom: 15px;">The budget for your workshop has been ${status.toLowerCase()}:</p>
          
          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 5px 0; color: #374151;"><strong>Workshop:</strong> ${workshopTitle}</p>
            <p style="margin: 5px 0; color: #374151;"><strong>Status:</strong> ${status}</p>
            <p style="margin: 5px 0; color: #374151;"><strong>Remarks:</strong> ${remarks}</p>
          </div>
          
          <p style="color: #374151; margin-bottom: 15px;">Please login to the portal to view the details and proceed accordingly.</p>
          
          <div style="margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/workshops" style="background-color: ${status === 'APPROVED' ? '#059669' : '#dc2626'}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Workshop</a>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
            Best regards,<br>
            Yugam Finance Team<br>
            Kumaraguru College of Technology
          </p>
        </div>
      </div>
    `,
  }),

  workshopExpenseAdded: (workshopTitle: string, itemName: string, amount: number, addedBy: string) => ({
    subject: `New Workshop Expense Added: ${workshopTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
        <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h2 style="color: #7c3aed; margin-bottom: 20px;">New Workshop Expense Added</h2>
          <p style="color: #374151; margin-bottom: 15px;">Dear Workshop Coordinator,</p>
          <p style="color: #374151; margin-bottom: 15px;">A new expense has been added to your workshop:</p>
          
          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 5px 0; color: #374151;"><strong>Workshop:</strong> ${workshopTitle}</p>
            <p style="margin: 5px 0; color: #374151;"><strong>Item:</strong> ${itemName}</p>
            <p style="margin: 5px 0; color: #374151;"><strong>Amount:</strong> ₹${amount.toLocaleString()}</p>
            <p style="margin: 5px 0; color: #374151;"><strong>Added by:</strong> ${addedBy}</p>
          </div>
          
          <p style="color: #374151; margin-bottom: 15px;">Please login to the portal to view the updated budget status.</p>
          
          <div style="margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/workshops" style="background-color: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Workshop</a>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
            Best regards,<br>
            Yugam Finance Team<br>
            Kumaraguru College of Technology
          </p>
        </div>
      </div>
    `,
  }),

  budgetSubmitted: (eventTitle: string, teamLeadName: string) => ({
    subject: `Budget Submitted for Review: ${eventTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
        <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h2 style="color: #d97706; margin-bottom: 20px;">Budget Submitted for Review</h2>
          <p style="color: #374151; margin-bottom: 15px;">Dear Finance Team,</p>
          <p style="color: #374151; margin-bottom: 15px;">A budget has been submitted for review:</p>
          
          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 5px 0; color: #374151;"><strong>Event/Workshop:</strong> ${eventTitle}</p>
            <p style="margin: 5px 0; color: #374151;"><strong>Submitted by:</strong> ${teamLeadName}</p>
          </div>
          
          <p style="color: #374151; margin-bottom: 15px;">Please login to the portal to review and approve the budget.</p>
          
          <div style="margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/budgets" style="background-color: #d97706; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Review Budget</a>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
            Best regards,<br>
            Yugam Finance Portal<br>
            Kumaraguru College of Technology
          </p>
        </div>
      </div>
    `,
  }),

  budgetApproved: (eventTitle: string, status: string, remarks: string) => ({
    subject: `Budget ${status}: ${eventTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
        <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h2 style="color: ${status === 'APPROVED' ? '#059669' : '#dc2626'}; margin-bottom: 20px;">Budget ${status}</h2>
          <p style="color: #374151; margin-bottom: 15px;">Dear Team,</p>
          <p style="color: #374151; margin-bottom: 15px;">The budget for your event/workshop has been ${status.toLowerCase()}:</p>
          
          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 5px 0; color: #374151;"><strong>Event/Workshop:</strong> ${eventTitle}</p>
            <p style="margin: 5px 0; color: #374151;"><strong>Status:</strong> ${status}</p>
            <p style="margin: 5px 0; color: #374151;"><strong>Remarks:</strong> ${remarks}</p>
          </div>
          
          <p style="color: #374151; margin-bottom: 15px;">Please login to the portal to view the details and proceed accordingly.</p>
          
          <div style="margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/events" style="background-color: ${status === 'APPROVED' ? '#059669' : '#dc2626'}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Event</a>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
            Best regards,<br>
            Yugam Finance Team<br>
            Kumaraguru College of Technology
          </p>
        </div>
      </div>
    `,
  }),

  expenseAdded: (eventTitle: string, itemName: string, amount: number, addedBy: string) => ({
    subject: `New Expense Added: ${eventTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
        <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h2 style="color: #7c3aed; margin-bottom: 20px;">New Expense Added</h2>
          <p style="color: #374151; margin-bottom: 15px;">Dear Event Coordinator,</p>
          <p style="color: #374151; margin-bottom: 15px;">A new expense has been added to your event/workshop:</p>
          
          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 5px 0; color: #374151;"><strong>Event/Workshop:</strong> ${eventTitle}</p>
            <p style="margin: 5px 0; color: #374151;"><strong>Item:</strong> ${itemName}</p>
            <p style="margin: 5px 0; color: #374151;"><strong>Amount:</strong> ₹${amount.toLocaleString()}</p>
            <p style="margin: 5px 0; color: #374151;"><strong>Added by:</strong> ${addedBy}</p>
          </div>
          
          <p style="color: #374151; margin-bottom: 15px;">Please login to the portal to view the updated budget status.</p>
          
          <div style="margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/events" style="background-color: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Event</a>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
            Best regards,<br>
            Yugam Finance Team<br>
            Kumaraguru College of Technology
          </p>
        </div>
      </div>
    `,
  }),
};