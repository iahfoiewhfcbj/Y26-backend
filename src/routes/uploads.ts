import express from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth';
import { logger } from '../utils/logger';
import { sendEmail, emailTemplates } from '../utils/email';

const router = express.Router();
const prisma = new PrismaClient();

// Configure multer for file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.mimetype === 'application/vnd.ms-excel') {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files are allowed'));
    }
  }
});

// Bulk upload users
router.post('/users', authenticate, authorize(['ADMIN']), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[]
    };

    for (const row of data) {
      try {
        const userData = row as any;
        
        // Validate required fields
        if (!userData.name || !userData.email || !userData.role) {
          results.failed++;
          results.errors.push(`Row ${data.indexOf(row) + 2}: Missing required fields (name, email, role)`);
          continue;
        }

        // Check if user already exists
        const existingUser = await prisma.user.findUnique({
          where: { email: userData.email }
        });

        if (existingUser) {
          results.failed++;
          results.errors.push(`Row ${data.indexOf(row) + 2}: User with email ${userData.email} already exists`);
          continue;
        }

        // Generate password in format: Iam<NAME>123!@#
        const cleanName = userData.name.replace(/\s+/g, '');
        const tempPassword = `Iam${cleanName}123!@#`;
        const hashedPassword = await bcrypt.hash(tempPassword, 12);

        // Create user
        await prisma.user.create({
          data: {
            name: userData.name,
            email: userData.email,
            role: userData.role,
            password: hashedPassword
          }
        });

        // Send welcome email
        try {
          const emailContent = emailTemplates.userWelcome(userData.name, userData.email, tempPassword);
          await sendEmail({
            to: userData.email,
            subject: emailContent.subject,
            html: emailContent.html
          });
        } catch (emailError) {
          console.error('Failed to send welcome email:', emailError);
          results.errors.push(`Row ${data.indexOf(row) + 2}: Welcome email failed to send`);
        }

        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(`Row ${data.indexOf(row) + 2}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    res.json({
      message: 'Bulk upload completed',
      results
    });
  } catch (error) {
    logger.error('Bulk upload users error:', error);
    res.status(500).json({ error: 'Failed to process bulk upload' });
  }
});

// Bulk upload categories
router.post('/categories', authenticate, authorize(['ADMIN']), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[]
    };

    for (const row of data) {
      try {
        const categoryData = row as any;
        
        // Validate required fields
        if (!categoryData.name) {
          results.failed++;
          results.errors.push(`Row ${data.indexOf(row) + 2}: Missing required field (name)`);
          continue;
        }

        // Check if category already exists
        const existingCategory = await prisma.budgetCategory.findFirst({
          where: { name: categoryData.name }
        });

        if (existingCategory) {
          results.failed++;
          results.errors.push(`Row ${data.indexOf(row) + 2}: Category with name ${categoryData.name} already exists`);
          continue;
        }

        // Create category
        await prisma.budgetCategory.create({
          data: {
            name: categoryData.name,
            description: categoryData.description || null,
            order: categoryData.order ? parseInt(categoryData.order) : 0
          }
        });

        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(`Row ${data.indexOf(row) + 2}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    res.json({
      message: 'Bulk upload completed',
      results
    });
  } catch (error) {
    logger.error('Bulk upload categories error:', error);
    res.status(500).json({ error: 'Failed to process bulk upload' });
  }
});

// Bulk upload venues
router.post('/venues', authenticate, authorize(['ADMIN']), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[]
    };

    for (const row of data) {
      try {
        const venueData = row as any;
        
        // Validate required fields
        if (!venueData.name || !venueData.location) {
          results.failed++;
          results.errors.push(`Row ${data.indexOf(row) + 2}: Missing required fields (name, location)`);
          continue;
        }

        // Check if venue already exists
        const existingVenue = await prisma.venue.findFirst({
          where: { 
            name: venueData.name,
            location: venueData.location
          }
        });

        if (existingVenue) {
          results.failed++;
          results.errors.push(`Row ${data.indexOf(row) + 2}: Venue with name ${venueData.name} at location ${venueData.location} already exists`);
          continue;
        }

        // Create venue
        await prisma.venue.create({
          data: {
            name: venueData.name,
            location: venueData.location,
            capacity: venueData.capacity ? parseInt(venueData.capacity) : null
          }
        });

        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(`Row ${data.indexOf(row) + 2}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    res.json({
      message: 'Bulk upload completed',
      results
    });
  } catch (error) {
    logger.error('Bulk upload venues error:', error);
    res.status(500).json({ error: 'Failed to process bulk upload' });
  }
});

// Bulk upload products
router.post('/products', authenticate, authorize(['ADMIN']), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[],
      categoriesToCreate: [] as string[]
    };

    // First pass: collect unique category names that don't exist
    const categoryNames = [...new Set(data.map((row: any) => row.categoryName).filter(Boolean))];
    const existingCategories = await prisma.budgetCategory.findMany({
      where: { name: { in: categoryNames } }
    });
    
    const existingCategoryNames = existingCategories.map(cat => cat.name);
    const missingCategories = categoryNames.filter(name => !existingCategoryNames.includes(name));
    
    if (missingCategories.length > 0) {
      results.categoriesToCreate = missingCategories;
    }

    // If there are missing categories and user wants to create them
    if (req.body.createMissingCategories === 'true' && missingCategories.length > 0) {
      for (const categoryName of missingCategories) {
        try {
          await prisma.budgetCategory.create({
            data: {
              name: categoryName,
              description: `Auto-created from bulk upload`,
              order: 0
            }
          });
        } catch (error) {
          logger.error(`Failed to create category ${categoryName}:`, error);
        }
      }
      
      // Refresh existing categories after creating new ones
      const updatedCategories = await prisma.budgetCategory.findMany({
        where: { name: { in: categoryNames } }
      });
      existingCategories.push(...updatedCategories.filter(cat => !existingCategoryNames.includes(cat.name)));
    }

    // Second pass: create products
    for (const row of data) {
      try {
        const productData = row as any;
        
        // Validate required fields
        if (!productData.name) {
          results.failed++;
          results.errors.push(`Row ${data.indexOf(row) + 2}: Missing required field (name)`);
          continue;
        }

        // Check if product already exists
        const existingProduct = await prisma.productCatalog.findFirst({
          where: { name: productData.name }
        });

        if (existingProduct) {
          results.failed++;
          results.errors.push(`Row ${data.indexOf(row) + 2}: Product with name ${productData.name} already exists`);
          continue;
        }

        // Find category if specified
        let categoryId = null;
        if (productData.categoryName) {
          const category = existingCategories.find(cat => cat.name === productData.categoryName);
          if (category) {
            categoryId = category.id;
          } else if (req.body.createMissingCategories !== 'true') {
            results.failed++;
            results.errors.push(`Row ${data.indexOf(row) + 2}: Category "${productData.categoryName}" does not exist`);
            continue;
          }
        }

        // Create product
        await prisma.productCatalog.create({
          data: {
            name: productData.name,
            unitPrice: productData.unitPrice ? parseFloat(productData.unitPrice) : null,
            unit: productData.unit || null,
            categoryId: categoryId
          }
        });

        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(`Row ${data.indexOf(row) + 2}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    res.json({
      message: 'Bulk upload completed',
      results
    });
  } catch (error) {
    logger.error('Bulk upload products error:', error);
    res.status(500).json({ error: 'Failed to process bulk upload' });
  }
});

export default router; 